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
});
