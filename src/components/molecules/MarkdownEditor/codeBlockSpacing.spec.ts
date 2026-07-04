import { $isTableCellNode, $isTableNode, $isTableRowNode } from "@lexical/table";
import { $getRoot } from "lexical";
import { describe, expect, test } from "vitest";

import {
  $openMarkdown,
  $readMarkdown,
  $setMarkdown,
  createTestHeadlessEditor,
} from "./__tests__/utils";

// A fenced code block glued directly to prose (no blank line either side)
// is valid Markdown but reads poorly on disk. The CODE transformer's export
// (transformers.ts) pads a top-level code block with a blank line on any
// side that touches another sibling, and the mount-time pipeline
// ($normalizeBlockSpacing) undoes exactly that padding on the way back
// in — so the app always SAVES a breathing-room file while the in-editor
// tree only ever grows a real gap when the user actually asks for one. See
// blockSpacing.spec.ts for the same feature generalized to quotes, lists,
// and horizontal rules.
describe("code block spacing — export padding", () => {
  test("no gap in the editor still saves with one blank line on each side", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "paragraph foo\n```js\nthis is a code\n```\nparagraph bar");
    expect($readMarkdown(editor)).toBe(
      "paragraph foo\n\n```js\nthis is a code\n```\n\nparagraph bar",
    );
  });

  test("a code block at the very start of the document gets no leading pad", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "```js\ncode\n```\nafter");
    expect($readMarkdown(editor)).toBe("```js\ncode\n```\n\nafter");
  });

  test("a code block at the very end of the document gets no trailing pad", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "before\n```js\ncode\n```");
    expect($readMarkdown(editor)).toBe("before\n\n```js\ncode\n```");
  });

  test("a lone code block with nothing else in the document gets no padding", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "```js\ncode\n```");
    expect($readMarkdown(editor)).toBe("```js\ncode\n```");
  });

  test("two adjacent code blocks share a single blank-line boundary, not two", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "```js\nfirst\n```\n```js\nsecond\n```");
    expect($readMarkdown(editor)).toBe("```js\nfirst\n```\n\n```js\nsecond\n```");
  });

  // An explicit empty paragraph (the user pressing Enter for a real blank
  // line) must read as MORE pronounced than the auto-inserted minimum, or a
  // reload couldn't tell "the app added this" apart from "the user asked
  // for this".
  test("an explicit blank line in the editor saves as two blank lines, not one", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "paragraph foo\n\n```js\nthis is a code\n```\n\nparagraph bar");
    expect($readMarkdown(editor)).toBe(
      "paragraph foo\n\n\n```js\nthis is a code\n```\n\n\nparagraph bar",
    );
  });

  test("two explicit blank lines in the editor save as three blank lines", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "paragraph foo\n\n\n```js\nthis is a code\n```\n\n\nparagraph bar");
    expect($readMarkdown(editor)).toBe(
      "paragraph foo\n\n\n\n```js\nthis is a code\n```\n\n\n\nparagraph bar",
    );
  });

  // Nested inside a table cell, an extra blank line would be escaped by
  // `encodeCell` into a literal `\n` the root-only import cleanup never
  // unwinds — the export padding must not fire there at all. Asserts
  // against the CELL's raw text content directly (not a round trip through
  // the table's own Markdown, which has a PRE-EXISTING, unrelated bug: a
  // single-line code fence inside a cell already imports as a multi-line
  // CodeNode before this feature's code ever runs — reproduced on stock
  // `main` with no code-block-spacing changes applied at all).
  test("a code block inside a table cell is not padded", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, ["| a |", "| --- |", "| ```js code``` |"].join("\n"));

    const cellText = editor.getEditorState().read(() => {
      const table = $getRoot().getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected a TableNode");
      const bodyRow = table.getChildAtIndex(1);
      if (!$isTableRowNode(bodyRow)) throw new Error("expected the body TableRowNode");
      const cell = bodyRow.getFirstChild();
      if (!$isTableCellNode(cell)) throw new Error("expected a TableCellNode");
      return cell.getTextContent();
    });

    // No leading/trailing blank line was added around the CodeNode's own
    // fence inside the cell — whatever its (pre-existing, unrelated) import
    // shape, this feature's padding never touched it.
    expect(cellText.startsWith("\n")).toBe(false);
    expect(cellText.endsWith("\n")).toBe(false);
  });
});

// The full "save, then reopen" cycle: import through the production
// mount-time pipeline (`$openMarkdown`, mirroring `$seedMarkdownEditorState`)
// and export back out. Every case must be a FIXED POINT — reopening a file
// this app just saved must reproduce byte-identical output on the next
// save, or the blank-line count would drift upward on every open/close.
describe("code block spacing — open→save round trip is a fixed point", () => {
  test("the auto-padded (1 blank line) shape reopens with no explicit gap and re-saves identically", () => {
    const source = "paragraph foo\n\n```js\nthis is a code\n```\n\nparagraph bar";
    const editor = createTestHeadlessEditor();
    $openMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  test("an explicit (2 blank lines) shape reopens preserving the explicit gap and re-saves identically", () => {
    const source = "paragraph foo\n\n\n```js\nthis is a code\n```\n\n\nparagraph bar";
    const editor = createTestHeadlessEditor();
    $openMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  test("a deeper explicit (3 blank lines) shape is also a fixed point", () => {
    const source = "paragraph foo\n\n\n\n```js\nthis is a code\n```\n\n\n\nparagraph bar";
    const editor = createTestHeadlessEditor();
    $openMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  test("two adjacent code blocks separated by one blank line are a fixed point", () => {
    const source = "```js\nfirst\n```\n\n```js\nsecond\n```";
    const editor = createTestHeadlessEditor();
    $openMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  test("two adjacent code blocks separated by two blank lines are a fixed point", () => {
    const source = "```js\nfirst\n```\n\n\n```js\nsecond\n```";
    const editor = createTestHeadlessEditor();
    $openMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  test("a code block at document start/end with no surrounding blank line is a fixed point", () => {
    const source = "```js\ncode\n```\n\nafter";
    const editor = createTestHeadlessEditor();
    $openMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  // Reopening the auto-padded shape must NOT reconstruct an explicit empty
  // paragraph — otherwise every save/reopen cycle would ratchet the file's
  // blank-line count up by one forever.
  test("reopening the auto-padded shape does not grow on a second save", () => {
    const original = "paragraph foo\n```js\nthis is a code\n```\nparagraph bar";
    const editor1 = createTestHeadlessEditor();
    $setMarkdown(editor1, original);
    const savedOnce = $readMarkdown(editor1);
    expect(savedOnce).toBe("paragraph foo\n\n```js\nthis is a code\n```\n\nparagraph bar");

    const editor2 = createTestHeadlessEditor();
    $openMarkdown(editor2, savedOnce);
    const savedTwice = $readMarkdown(editor2);
    expect(savedTwice).toBe(savedOnce);

    const editor3 = createTestHeadlessEditor();
    $openMarkdown(editor3, savedTwice);
    expect($readMarkdown(editor3)).toBe(savedOnce);
  });
});
