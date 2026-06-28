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
});
