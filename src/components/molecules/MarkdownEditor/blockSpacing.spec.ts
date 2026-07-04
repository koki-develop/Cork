import { $createListItemNode, $createListNode } from "@lexical/list";
import { $createQuoteNode } from "@lexical/rich-text";
import { $createTextNode, $getRoot } from "lexical";
import { describe, expect, test } from "vitest";

import {
  $openMarkdown,
  $readMarkdown,
  $setMarkdown,
  createTestHeadlessEditor,
} from "./__tests__/utils";

// Generalizes the code-block spacing feature (see codeBlockSpacing.spec.ts)
// to the other three "block-shaped" top-level elements: blockquotes, lists
// (bullet/ordered/check), and horizontal rules. Each always SAVES with a
// blank line on any side that touches a DIFFERENT kind of sibling — glued
// directly to prose (or to each other) is valid Markdown but reads poorly in
// a plain text editor or on GitHub. `$normalizeBlockSpacing` (run from
// `$seedMarkdownEditorState` right after import) is the exact inverse, so a
// save/reopen/save cycle never grows the blank-line count.
//
// Two families of exemption keep this from over-padding:
//   - Adjacent lists (any marker types, in any combination) never get a
//     forced gap between them — that's how every Markdown viewer renders a
//     bullet list immediately followed by an ordered or check list.
//   - Adjacent top-level quotes are already separated by a real spacer
//     paragraph ($insertSpacersBetweenAdjacentQuotes / the quote merge
//     logic), so this feature leaves that boundary alone rather than
//     doubling it.
describe("block spacing — quote export padding", () => {
  test("no gap in the editor still saves with one blank line on each side", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "aaa\n> bbb\nccc");
    expect($readMarkdown(editor)).toBe("aaa\n\n> bbb\n\nccc");
  });

  test("a quote at the very start of the document gets no leading pad", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "> aaa\nbbb");
    expect($readMarkdown(editor)).toBe("> aaa\n\nbbb");
  });

  test("a quote at the very end of the document gets no trailing pad", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "aaa\n> bbb");
    expect($readMarkdown(editor)).toBe("aaa\n\n> bbb");
  });

  test("a lone quote with nothing else in the document gets no padding", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "> aaa");
    expect($readMarkdown(editor)).toBe("> aaa");
  });

  // Two adjacent top-level QuoteNodes only ever arise with a real spacer
  // paragraph already between them (consecutive same-depth `> ` lines always
  // merge into one QuoteNode instead) — that spacer alone supplies the
  // exactly-one-blank-line gap, so this feature must not pad on top of it.
  test("adjacent quotes keep their existing single-blank-line gap, not two", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "> aaa\n\n> bbb");
    expect($readMarkdown(editor)).toBe("> aaa\n\n> bbb");
  });

  // Two top-level QuoteNodes with ZERO paragraphs between them never arises
  // through the Markdown transformer pipeline (consecutive `> ` lines always
  // merge into one QuoteNode instead), but a native HTML clipboard paste of
  // two separate `<blockquote>` elements builds the Lexical tree directly
  // and can leave this exact shape — MarkdownPastePlugin explicitly bails
  // whenever the clipboard also carries a `text/html` payload. Without a
  // pad here, the saved file would glue the two quotes into one line
  // (`> aaa\n> bbb`), and reopening it would silently and permanently fuse
  // them into a single blockquote via the normal `> ` merge logic.
  test("two quotes genuinely touching with no paragraph between them still get padded apart", () => {
    const editor = createTestHeadlessEditor();
    editor.update(
      () => {
        const first = $createQuoteNode();
        first.append($createTextNode("aaa"));
        const second = $createQuoteNode();
        second.append($createTextNode("bbb"));
        $getRoot().append(first, second);
      },
      { discrete: true },
    );
    const saved = $readMarkdown(editor);
    expect(saved).toBe("> aaa\n\n> bbb");

    // And the padded save must reopen as two distinct quotes, not fuse
    // into one on the next round trip.
    const editor2 = createTestHeadlessEditor();
    $openMarkdown(editor2, saved);
    expect($readMarkdown(editor2)).toBe(saved);
  });
});

describe("block spacing — list export padding", () => {
  test("no gap in the editor still saves with one blank line on each side", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "aaa\n- bbb\nccc");
    expect($readMarkdown(editor)).toBe("aaa\n\n- bbb\n\nccc");
  });

  test("a list at the very start of the document gets no leading pad", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "- aaa\nbbb");
    expect($readMarkdown(editor)).toBe("- aaa\n\nbbb");
  });

  test("a list at the very end of the document gets no trailing pad", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "aaa\n- bbb");
    expect($readMarkdown(editor)).toBe("aaa\n\n- bbb");
  });

  // Bullet, ordered, and check lists of different marker types glued
  // directly together read fine on disk (that's how every Markdown viewer
  // renders them) — unlike code/quote/hr, adjacent lists never get a forced
  // gap, regardless of which two marker types are on either side.
  test("adjacent lists of different marker types stay glued together", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "- bbb\n1. ccc\n- [ ] ddd");
    expect($readMarkdown(editor)).toBe("- bbb\n1. ccc\n- [ ] ddd");
  });

  // Unlike QUOTE below, two SAME-marker-type ListNodes genuinely touching
  // with zero paragraphs between them is not a shape `$isLeadingPadExempt`
  // needs to defend against: `ListNode`/`ListItemNode`'s own core-level
  // `$transform` (registered by `@lexical/list` independently of any
  // plugin) automatically merges two adjacent same-type lists back into one
  // the moment they become siblings — even constructing them directly and
  // appending both to root in a single `editor.update()` collapses them
  // into one list before the update commits.
  test("two same-type ListNodes appended directly to root merge into one list (Lexical core, not this feature)", () => {
    const editor = createTestHeadlessEditor();
    editor.update(
      () => {
        const first = $createListNode("bullet");
        const firstItem = $createListItemNode();
        firstItem.append($createTextNode("bbb"));
        first.append(firstItem);

        const second = $createListNode("bullet");
        const secondItem = $createListItemNode();
        secondItem.append($createTextNode("ccc"));
        second.append(secondItem);

        $getRoot().append(first, second);
      },
      { discrete: true },
    );
    const shape = editor.getEditorState().read(() =>
      $getRoot()
        .getChildren()
        .map((n) => n.getType())
        .join(","),
    );
    expect(shape).toBe("list");
    expect($readMarkdown(editor)).toBe("- bbb\n- ccc");
  });

  test("the full list example from the feature request", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(
      editor,
      [
        "aaa",
        "- bbb",
        "- bbb",
        "ccc",
        "1. ddd",
        "2. ddd",
        "eee",
        "- [ ] fff",
        "- [x] fff",
        "ggg",
      ].join("\n"),
    );
    expect($readMarkdown(editor)).toBe(
      [
        "aaa",
        "",
        "- bbb",
        "- bbb",
        "",
        "ccc",
        "",
        "1. ddd",
        "2. ddd",
        "",
        "eee",
        "",
        "- [ ] fff",
        "- [x] fff",
        "",
        "ggg",
      ].join("\n"),
    );
  });
});

describe("block spacing — horizontal rule export padding", () => {
  test("the horizontal rule example from the feature request", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "aaa\n---\nbbb");
    expect($readMarkdown(editor)).toBe("aaa\n\n---\n\nbbb");
  });

  test("a rule at the very start of the document gets no leading pad", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "---\naaa");
    expect($readMarkdown(editor)).toBe("---\n\naaa");
  });

  test("a rule at the very end of the document gets no trailing pad", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "aaa\n---");
    expect($readMarkdown(editor)).toBe("aaa\n\n---");
  });
});

describe("block spacing — mixed boundaries", () => {
  // The exact "ミックス" example from the feature request: a quote followed
  // directly by a run of three different list types followed directly by a
  // rule. Only the quote↔list and list↔rule boundaries get a blank line —
  // the three different-typed lists stay glued together.
  test("the mixed example from the feature request", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "> aaa\n- bbb\n1. ccc\n- [ ] ddd\n---");
    expect($readMarkdown(editor)).toBe("> aaa\n\n- bbb\n1. ccc\n- [ ] ddd\n\n---");
  });

  test("a code block sitting directly next to a list only gets one shared blank line", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "- aaa\n```js\ncode\n```");
    expect($readMarkdown(editor)).toBe("- aaa\n\n```js\ncode\n```");
  });

  test("a quote sitting directly next to a code block only gets one shared blank line", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "```js\ncode\n```\n> aaa");
    expect($readMarkdown(editor)).toBe("```js\ncode\n```\n\n> aaa");
  });
});

// The full "save, then reopen" cycle: import through the production
// mount-time pipeline (`$openMarkdown`, mirroring `$seedMarkdownEditorState`)
// and export back out. Every case must be a FIXED POINT — reopening a file
// this app just saved must reproduce byte-identical output on the next
// save, or the blank-line count would drift upward on every open/close.
describe("block spacing — open→save round trip is a fixed point", () => {
  test("an auto-padded quote reopens with no explicit gap and re-saves identically", () => {
    const source = "aaa\n\n> bbb\n\nccc";
    const editor = createTestHeadlessEditor();
    $openMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  test("an explicit (2 blank lines) quote gap reopens preserving the explicit gap", () => {
    const source = "aaa\n\n\n> bbb\n\n\nccc";
    const editor = createTestHeadlessEditor();
    $openMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  test("adjacent quotes with their single existing gap are a fixed point", () => {
    const source = "> aaa\n\n> bbb";
    const editor = createTestHeadlessEditor();
    $openMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  test("the full auto-padded list example reopens and re-saves identically", () => {
    const source = [
      "aaa",
      "",
      "- bbb",
      "- bbb",
      "",
      "ccc",
      "",
      "1. ddd",
      "2. ddd",
      "",
      "eee",
      "",
      "- [ ] fff",
      "- [x] fff",
      "",
      "ggg",
    ].join("\n");
    const editor = createTestHeadlessEditor();
    $openMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  test("adjacent lists of different marker types (no gap) are a fixed point", () => {
    const source = "- bbb\n1. ccc\n- [ ] ddd";
    const editor = createTestHeadlessEditor();
    $openMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  // Two lists of the SAME marker type separated by an explicit blank line
  // stay as two separate ListNodes (not merged into one) — the explicit gap
  // must survive the round trip unchanged, same as the quote/code precedent.
  test("two same-type lists separated by an explicit blank line are a fixed point", () => {
    const source = "- bbb\n\n- ccc";
    const editor = createTestHeadlessEditor();
    $openMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  test("the auto-padded horizontal rule example reopens and re-saves identically", () => {
    const source = "aaa\n\n---\n\nbbb";
    const editor = createTestHeadlessEditor();
    $openMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  test("the full mixed example reopens and re-saves identically", () => {
    const source = "> aaa\n\n- bbb\n1. ccc\n- [ ] ddd\n\n---";
    const editor = createTestHeadlessEditor();
    $openMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  // Reopening any auto-padded shape must NOT reconstruct an explicit empty
  // paragraph — otherwise every save/reopen cycle would ratchet the file's
  // blank-line count up by one forever.
  test("reopening an auto-padded quote does not grow on a second save", () => {
    const original = "aaa\n> bbb\nccc";
    const editor1 = createTestHeadlessEditor();
    $setMarkdown(editor1, original);
    const savedOnce = $readMarkdown(editor1);
    expect(savedOnce).toBe("aaa\n\n> bbb\n\nccc");

    const editor2 = createTestHeadlessEditor();
    $openMarkdown(editor2, savedOnce);
    const savedTwice = $readMarkdown(editor2);
    expect(savedTwice).toBe(savedOnce);
  });
});
