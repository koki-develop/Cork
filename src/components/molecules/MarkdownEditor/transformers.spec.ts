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
});
