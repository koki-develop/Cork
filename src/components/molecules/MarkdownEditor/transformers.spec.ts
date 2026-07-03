import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { describe, expect, test } from "vitest";

import { $readMarkdown, $setMarkdown, createTestHeadlessEditor } from "./__tests__/utils";

// MarkdownEditor's root contract: a Markdown string survives
// import → editor state → export byte-for-byte. The two cases (heading,
// unordered list) are the simplest shapes — a regression that normalizes
// whitespace, list markers, or trailing newlines surfaces here first.
describe("MARKDOWN_TRANSFORMERS round-trip", () => {
  test("a heading round-trips through the transformer set", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "# Hello");
    expect($readMarkdown(editor)).toBe("# Hello");
  });

  test("an unordered list round-trips identically", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "- one\n- two");
    expect($readMarkdown(editor)).toBe("- one\n- two");
  });

  test("a multi-line body round-trips without phantom blank lines", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "aaa\nbbb\nccc");
    expect($readMarkdown(editor)).toBe("aaa\nbbb\nccc");
  });

  test("leading blank lines are preserved through round-trip", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "\n\nbody");
    expect($readMarkdown(editor)).toBe("\n\nbody");
  });

  test("intentional paragraph breaks (empty lines) are preserved", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "aaa\n\nbbb");
    expect($readMarkdown(editor)).toBe("aaa\n\nbbb");
  });

  // Upstream `CODE` drops one leading blank line and every trailing blank
  // line in `linesInBetween`, so without our override `` ```\n\n\naaa\n\n\n``` ``
  // would shrink to `` ```\n\naaa\n``` `` after one round-trip and to
  // `` ```\naaa\n``` `` after the next. Two-pass assertion guards both
  // hops at once.
  test("blank lines inside a fenced code block survive two round-trips", () => {
    const source = "```\n\n\naaa\n\n\n```";
    const first = createTestHeadlessEditor();
    $setMarkdown(first, source);
    const afterOne = $readMarkdown(first);
    expect(afterOne).toBe(source);

    const second = createTestHeadlessEditor();
    $setMarkdown(second, afterOne);
    expect($readMarkdown(second)).toBe(source);
  });

  test("a code block with only blank lines round-trips", () => {
    const editor = createTestHeadlessEditor();
    const source = "```\n\n\n\n```";
    $setMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  // A single blank line inside a fenced code block has only one
  // representation in textContent (the empty string), and upstream's
  // CODE.export skips the body separator when textContent is empty —
  // so the blank line collapses out unless export is overridden too.
  test("a single blank line inside a code block round-trips", () => {
    const editor = createTestHeadlessEditor();
    const source = "```\n\n```";
    $setMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  // The truly-empty code block (no body lines at all) must stay
  // distinguishable from the single-blank-line case — both have
  // textContent === "" so the distinction has to live somewhere else
  // (a node-state flag, or child-count).
  test("a truly-empty code block stays empty (distinct from 1-blank case)", () => {
    const editor = createTestHeadlessEditor();
    const source = "```\n```";
    $setMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  // Upstream `CODE.export` reads `$getState(node, codeFenceState)` to
  // recover the literal opening-fence width and falls back to the
  // 3-backtick default when unset. A 4+ backtick fence is the canonical
  // way to embed triple-backtick content inside a code block, so losing
  // the width on first save silently rewrites the file's literal shape.
  test("a 4-backtick fence width survives round-trip", () => {
    const editor = createTestHeadlessEditor();
    const source = "````\nfoo\n````";
    $setMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  test("a 5-backtick fence wrapping triple-backtick content survives", () => {
    const editor = createTestHeadlessEditor();
    const source = "`````\nshow ```code```\n`````";
    $setMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  // Reported as a Cork bug: opening a task after applying inline code to a
  // whitespace-only selection shows a mangled body — the backticks end up
  // glued together with the whitespace pushed outside them. See `CODE_TEXT`'s
  // header comment in transformers.ts for the full upstream root cause.
  describe("inline code applied to a whitespace-only selection", () => {
    test("a single space round-trips as a one-space code span, not a stray space + empty span", () => {
      const editor = createTestHeadlessEditor();
      editor.update(
        () => {
          const text = $createTextNode(" ").toggleFormat("code");
          $getRoot().append($createParagraphNode().append(text));
        },
        { discrete: true },
      );
      expect($readMarkdown(editor)).toBe("` `");
    });

    test("two spaces round-trip as a two-space code span", () => {
      const editor = createTestHeadlessEditor();
      editor.update(
        () => {
          const text = $createTextNode("  ").toggleFormat("code");
          $getRoot().append($createParagraphNode().append(text));
        },
        { discrete: true },
      );
      expect($readMarkdown(editor)).toBe("`  `");
    });

    test("re-importing the exported span round-trips to the same markdown", () => {
      const editor = createTestHeadlessEditor();
      editor.update(
        () => {
          const text = $createTextNode(" ").toggleFormat("code");
          $getRoot().append($createParagraphNode().append(text));
        },
        { discrete: true },
      );
      const exported = $readMarkdown(editor);

      const reopened = createTestHeadlessEditor();
      $setMarkdown(reopened, exported);
      expect($readMarkdown(reopened)).toBe(exported);
    });

    test("a whitespace-only code span adjacent to bold-only text keeps both tags intact", () => {
      const editor = createTestHeadlessEditor();
      editor.update(
        () => {
          const bold = $createTextNode("bold").toggleFormat("bold");
          const space = $createTextNode(" ").toggleFormat("code");
          $getRoot().append($createParagraphNode().append(bold, space));
        },
        { discrete: true },
      );
      expect($readMarkdown(editor)).toBe("**bold**` `");
    });

    // A whitespace-only code run sandwiched between two other code-formatted
    // runs must merge into ONE unbroken span (matching what upstream already
    // does for adjacent same-format text nodes generally), not re-open/close
    // the backtick tag around just the middle run. This exercises the
    // `unclosedTags` adjacency bookkeeping our fix delegates to upstream's
    // real `exportFormat` — three separate TextNodes here (as toggling
    // format on a mid-selection produces) must still read as `` `aaa bbb` ``.
    test("a whitespace-only code run between two code runs merges into one span", () => {
      const editor = createTestHeadlessEditor();
      editor.update(
        () => {
          const before = $createTextNode("aaa").toggleFormat("code");
          const space = $createTextNode(" ").toggleFormat("code");
          const after = $createTextNode("bbb").toggleFormat("code");
          $getRoot().append($createParagraphNode().append(before, space, after));
        },
        { discrete: true },
      );
      expect($readMarkdown(editor)).toBe("`aaa bbb`");
    });
  });

  // Follow-up Cork bug report: a selection with real content but padding
  // spaces (e.g. "   a   ") also had its whitespace escape the backticks on
  // save. Same upstream root cause as the whitespace-only case above — see
  // `CODE_TEXT`'s header comment in transformers.ts.
  describe("inline code applied to a selection with leading/trailing whitespace", () => {
    test("whitespace on both sides of content stays inside the span", () => {
      const editor = createTestHeadlessEditor();
      editor.update(
        () => {
          const text = $createTextNode("   a   ").toggleFormat("code");
          $getRoot().append($createParagraphNode().append(text));
        },
        { discrete: true },
      );
      expect($readMarkdown(editor)).toBe("`   a   `");
    });

    test("leading-only whitespace stays inside the span", () => {
      const editor = createTestHeadlessEditor();
      editor.update(
        () => {
          const text = $createTextNode("   a").toggleFormat("code");
          $getRoot().append($createParagraphNode().append(text));
        },
        { discrete: true },
      );
      expect($readMarkdown(editor)).toBe("`   a`");
    });

    test("trailing-only whitespace stays inside the span", () => {
      const editor = createTestHeadlessEditor();
      editor.update(
        () => {
          const text = $createTextNode("a   ").toggleFormat("code");
          $getRoot().append($createParagraphNode().append(text));
        },
        { discrete: true },
      );
      expect($readMarkdown(editor)).toBe("`a   `");
    });

    test("content with no edge whitespace is unaffected", () => {
      const editor = createTestHeadlessEditor();
      editor.update(
        () => {
          const text = $createTextNode("a").toggleFormat("code");
          $getRoot().append($createParagraphNode().append(text));
        },
        { discrete: true },
      );
      expect($readMarkdown(editor)).toBe("`a`");
    });

    test("re-importing the exported span round-trips to the same markdown", () => {
      const editor = createTestHeadlessEditor();
      editor.update(
        () => {
          const text = $createTextNode("   a   ").toggleFormat("code");
          $getRoot().append($createParagraphNode().append(text));
        },
        { discrete: true },
      );
      const exported = $readMarkdown(editor);
      expect(exported).toBe("`   a   `");

      const reopened = createTestHeadlessEditor();
      $setMarkdown(reopened, exported);
      expect($readMarkdown(reopened)).toBe(exported);
    });

    test("a padded code span adjacent to bold-only text keeps both tags intact", () => {
      const editor = createTestHeadlessEditor();
      editor.update(
        () => {
          const bold = $createTextNode("bold").toggleFormat("bold");
          const code = $createTextNode("   a   ").toggleFormat("code");
          $getRoot().append($createParagraphNode().append(bold, code));
        },
        { discrete: true },
      );
      expect($readMarkdown(editor)).toBe("**bold**`   a   `");
    });
  });

  // `CODE_TEXT` wraps a code-formatted node's content in a paired zero-width-
  // space (U+200B) sentinel to work around the whitespace-splitting bug
  // above, then strips its own two markers back out. A naive
  // `text.split(SENTINEL).join("")` would strip EVERY U+200B in the result,
  // not just the two it added — silently deleting a real zero-width space
  // the user's own text legitimately contains (e.g. pasted from a source
  // that uses ZWSP as a line-wrap hint). Guards against that regression.
  describe("inline code content containing a real zero-width space", () => {
    test("a real U+200B inside the content survives export, not just the sentinels", () => {
      const editor = createTestHeadlessEditor();
      editor.update(
        () => {
          const text = $createTextNode("foo​bar").toggleFormat("code");
          $getRoot().append($createParagraphNode().append(text));
        },
        { discrete: true },
      );
      expect($readMarkdown(editor)).toBe("`foo​bar`");
    });

    test("a real U+200B at the very start of the content survives export", () => {
      const editor = createTestHeadlessEditor();
      editor.update(
        () => {
          const text = $createTextNode("​foo").toggleFormat("code");
          $getRoot().append($createParagraphNode().append(text));
        },
        { discrete: true },
      );
      expect($readMarkdown(editor)).toBe("`​foo`");
    });

    test("content that is a single real U+200B survives export", () => {
      const editor = createTestHeadlessEditor();
      editor.update(
        () => {
          const text = $createTextNode("​").toggleFormat("code");
          $getRoot().append($createParagraphNode().append(text));
        },
        { discrete: true },
      );
      expect($readMarkdown(editor)).toBe("`​`");
    });
  });
});
