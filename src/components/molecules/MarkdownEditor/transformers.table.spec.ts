import {
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  type TableCellNode,
  type TableNode,
} from "@lexical/table";
import { $getRoot, $isParagraphNode, $isTextNode } from "lexical";
import { describe, expect, test } from "vitest";

import { $readMarkdown, $setMarkdown, createTestHeadlessEditor } from "./__tests__/utils";

// Round-trip coverage for the custom TABLE transformer in transformers.ts. The
// transformer is responsible for two intertwined contracts:
//
//   1. A pipe-delimited table written to disk MUST reload to the same on-screen
//      shape — no silent rewrites of cell padding, header promotion, or row
//      shape. The export side always emits canonical GFM (`| --- |` after the
//      first row, single-space cell padding), so a NON-canonical input may be
//      rewritten on first save — that's a deliberate trade-off, not a bug.
//      Every test below uses the canonical shape on input so byte equality is
//      the right assertion.
//   2. Cell bodies recurse through MARKDOWN_TRANSFORMERS, so block-level
//      shortcuts (list, horizontal rule, quote) MUST be inert inside a cell
//      and stay as literal text — building a ListNode / HorizontalRuleNode /
//      QuoteNode inside a TableCellNode would mix incompatible key surfaces
//      (Tab navigates cells vs. indents lists, Backspace deletes cells vs.
//      exits lists) and the editor's `.cork-quote p` CSS would zero margins
//      on cell paragraphs. The cell-aware wrappers + the TABLE / HORIZONTAL_RULE
//      cell guards enforce this; without them, opening a file with a literal
//      `- foo` cell body would silently flip the cell into a bullet list and
//      drop the marker on the next save.
//
// Each test shows the on-disk Markdown (the "Before") and the exported
// Markdown after one round-trip (the "After"). For the cell-content tests,
// Before === After (the literal text MUST round-trip identically); for the
// transformer's structural tests, the After also describes the tree shape
// the import produces.

// Navigate to a specific cell by (row, col). Throws if the tree shape diverges
// from a flat grid — every cell test relies on the grid being well-formed, so
// surface that failure early instead of crashing on a downstream getTextContent.
function getCell(table: TableNode, row: number, col: number): TableCellNode {
  const r = table.getChildAtIndex(row);
  if (!$isTableRowNode(r)) throw new Error(`expected TableRowNode at row ${row}`);
  const c = r.getChildAtIndex(col);
  if (!$isTableCellNode(c)) throw new Error(`expected TableCellNode at (${row}, ${col})`);
  return c;
}

describe("TABLE transformer — round-trip", () => {
  // The simplest canonical shape — header row + divider + body row. The
  // divider row's only job is header promotion: it sets `__headerState` on
  // the row above, then is dropped from the tree. Export re-emits the
  // canonical divider so the markdown stays byte-identical.
  //
  // Before (on-disk):
  //   | a | b |
  //   | --- | --- |
  //   | c | d |
  //
  // After (re-exported, byte-identical to Before):
  //   | a | b |
  //   | --- | --- |
  //   | c | d |
  test("a 2-column header + body row round-trips byte-identically", () => {
    const editor = createTestHeadlessEditor();
    const markdown = ["| a | b |", "| --- | --- |", "| c | d |"].join("\n");
    $setMarkdown(editor, markdown);
    expect($readMarkdown(editor)).toBe(markdown);
  });

  // Multi-body-row table — verifies the import "merge into adjacent
  // TableNode with same column count" path. Each subsequent pipe row
  // lands into the same table, not a fresh one per line.
  //
  // Before (on-disk):
  //   | a | b |
  //   | --- | --- |
  //   | 1 | 2 |
  //   | 3 | 4 |
  //
  // After (byte-identical):
  //   | a | b |
  //   | --- | --- |
  //   | 1 | 2 |
  //   | 3 | 4 |
  test("a table with multiple body rows round-trips byte-identically", () => {
    const editor = createTestHeadlessEditor();
    const markdown = ["| a | b |", "| --- | --- |", "| 1 | 2 |", "| 3 | 4 |"].join("\n");
    $setMarkdown(editor, markdown);
    expect($readMarkdown(editor)).toBe(markdown);
  });

  // Tree-shape verification — `getTextContent()` alone wouldn't catch a
  // regression where header cells lose `__headerState` or rows aren't
  // promoted to TableRowNode. The on-disk markdown would still look right
  // next pass, but the cell rendering would lose its bg + bold.
  //
  // Before (on-disk):
  //   | a | b |
  //   | --- | --- |
  //   | c | d |
  //
  // After (tree shape):
  //   TableNode
  //     TableRowNode
  //       TableCellNode (header=true) "a"
  //       TableCellNode (header=true) "b"
  //     TableRowNode
  //       TableCellNode (header=false) "c"
  //       TableCellNode (header=false) "d"
  test("imports a 2x2 table as TableNode > [headerRow, bodyRow] with headerState on the first row", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, ["| a | b |", "| --- | --- |", "| c | d |"].join("\n"));

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      expect(table.getChildrenSize()).toBe(2);

      const headerRow = table.getChildAtIndex(0);
      if (!$isTableRowNode(headerRow)) throw new Error("expected TableRowNode at table[0]");
      expect(headerRow.getChildrenSize()).toBe(2);
      const h1 = getCell(table, 0, 0);
      const h2 = getCell(table, 0, 1);
      expect(h1.hasHeader()).toBe(true);
      expect(h2.hasHeader()).toBe(true);
      expect(h1.getTextContent()).toBe("a");
      expect(h2.getTextContent()).toBe("b");

      const bodyRow = table.getChildAtIndex(1);
      if (!$isTableRowNode(bodyRow)) throw new Error("expected TableRowNode at table[1]");
      expect(bodyRow.getChildrenSize()).toBe(2);
      const b1 = getCell(table, 1, 0);
      const b2 = getCell(table, 1, 1);
      expect(b1.hasHeader()).toBe(false);
      expect(b2.hasHeader()).toBe(false);
      expect(b1.getTextContent()).toBe("c");
      expect(b2.getTextContent()).toBe("d");
    });
  });

  // Regression for the `-+` (not `-*`) tightening on TABLE_ROW_DIVIDER_REG_EXP.
  // Without that fix a trailing all-empty body row (`|  |  |`) matched as a
  // divider on import, which would falsely promote the row above it
  // (already a body row) into a SECOND header — so a file written as
  // [header, body, body_empty] would reload as [header, body_promoted_to_header,
  // body_empty], silently rewriting the file shape on first save.
  //
  // Before (on-disk):
  //   | a | b |
  //   | --- | --- |
  //   | c | d |
  //   |  |  |        ← trailing empty body row (must NOT be read as a divider)
  //
  // After (byte-identical AND tree shape):
  //   | a | b |
  //   | --- | --- |
  //   | c | d |
  //   |  |  |
  //   (header row stays as the ONLY header; middle row stays a body row)
  test("a trailing all-empty body row stays a body row (not falsely matched as a divider)", () => {
    const editor = createTestHeadlessEditor();
    const markdown = ["| a | b |", "| --- | --- |", "| c | d |", "|  |  |"].join("\n");
    $setMarkdown(editor, markdown);
    expect($readMarkdown(editor)).toBe(markdown);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // 1 header row + 2 body rows (the trailing empty row is still a body row,
      // not a duplicate header promotion).
      expect(table.getChildrenSize()).toBe(3);

      // First row stayed as the header.
      expect(getCell(table, 0, 0).hasHeader()).toBe(true);
      // Middle row stayed as a body row (NOT promoted into a second header by
      // a bogus divider match on the empty row below).
      expect(getCell(table, 1, 0).hasHeader()).toBe(false);
      // Last empty body row stays a body row.
      expect(getCell(table, 2, 0).hasHeader()).toBe(false);
      expect(getCell(table, 2, 0).getTextContent()).toBe("");
      expect(getCell(table, 2, 1).getTextContent()).toBe("");
    });
  });

  // A cell-body pipe is escaped to `\|` on export and decoded on import,
  // so the `|` never gets read as a column boundary on the next load.
  // Without the encode/decode pair a `\|` cell would either eat the next
  // column on import or be re-split mid-roundtrip; both shapes drift the
  // on-screen table.
  //
  // Before (on-disk):
  //   | a \| b | c |       ← first cell contains `a | b` (literal pipe)
  //   | --- | --- |
  //
  // After (byte-identical; cell content is `a | b` text):
  //   | a \| b | c |
  //   | --- | --- |
  test("a cell body containing `|` round-trips as `\\|` and decodes back to `|` text", () => {
    const editor = createTestHeadlessEditor();
    const markdown = ["| a \\| b | c |", "| --- | --- |"].join("\n");
    $setMarkdown(editor, markdown);
    expect($readMarkdown(editor)).toBe(markdown);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // Just 1 row + 2 columns — the pipe inside cell[0] didn't split into a
      // third column.
      expect(table.getChildrenSize()).toBe(1);
      const headerRow = table.getFirstChild();
      if (!$isTableRowNode(headerRow)) throw new Error("expected TableRowNode");
      expect(headerRow.getChildrenSize()).toBe(2);
      expect(getCell(table, 0, 0).getTextContent()).toBe("a | b");
      expect(getCell(table, 0, 1).getTextContent()).toBe("c");
    });
  });

  // A cell body containing a literal backslash survives the round-trip.
  // The on-disk form is double-escaped (Lexical's inline export escapes
  // `\` → `\\` first, then encodeCell adds another layer, so each source
  // backslash lives as four backslashes between the pipes); decodeCell +
  // Lexical's `unescapeText` invert both layers on reload. The exact
  // on-disk form isn't a strict contract — what matters is that the cell
  // text survives every round-trip and never grows extra escapes
  // pass-after-pass.
  //
  // Before (on-disk; `\\\\` shows 4 literal backslashes between a and b):
  //   | a\\\\b | c |
  //   | --- | --- |
  //
  // After two round-trips — byte-identical (idempotent on a second pass;
  // a one-extra-backslash-per-cycle drift would only show on the second
  // pass, so the second pass IS the contract):
  //   | a\\\\b | c |
  //   | --- | --- |
  //
  // Cell tree state — one literal backslash (`a\b`):
  //   TableCellNode "a\b"
  test("a cell body containing a backslash survives one round-trip and is idempotent on a second pass", () => {
    const editor = createTestHeadlessEditor();
    const markdown = ["| a\\\\\\\\b | c |", "| --- | --- |"].join("\n");
    $setMarkdown(editor, markdown);
    const firstPass = $readMarkdown(editor);
    expect(firstPass).toBe(markdown);

    // Idempotence: a second import/export pass produces the same string.
    // Without this guard a "looks-fine" first pass could hide a one-extra-
    // backslash-per-cycle drift that only shows up after multiple saves.
    $setMarkdown(editor, firstPass);
    expect($readMarkdown(editor)).toBe(firstPass);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // The cell tree holds a single literal backslash — both encode layers
      // peeled correctly on the way in.
      expect(getCell(table, 0, 0).getTextContent()).toBe("a\\b");
    });
  });

  // List markers inside a cell stay as literal text. The cell-aware
  // wrapper around UNORDERED_LIST sees the parent is in a TableCellNode
  // and bails; without it, `| - foo | bar |` would reload as a single-cell
  // bullet list and the `- ` marker would be lost on the next save (the
  // cell would only hold "foo" text).
  //
  // Before (on-disk):
  //   | - foo | bar |   ← first cell looks like a bullet item
  //   | --- | --- |
  //
  // After (byte-identical; the cell stays as literal `- foo` text):
  //   | - foo | bar |
  //   | --- | --- |
  //
  // Cell tree state (cell 0, 0):
  //   TableCellNode
  //     ParagraphNode
  //       TextNode "- foo"   ← NOT a ListNode
  test("a cell body of `- foo` stays as literal text on round-trip (UNORDERED_LIST cell-aware bail)", () => {
    const editor = createTestHeadlessEditor();
    const markdown = ["| - foo | bar |", "| --- | --- |"].join("\n");
    $setMarkdown(editor, markdown);
    expect($readMarkdown(editor)).toBe(markdown);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      const cell = getCell(table, 0, 0);
      // Cell body is `- foo` literal text inside a single ParagraphNode — no
      // ListNode anywhere in the cell's subtree.
      expect(cell.getChildrenSize()).toBe(1);
      const paragraph = cell.getFirstChild();
      if (!$isParagraphNode(paragraph)) throw new Error("expected ParagraphNode in cell");
      const text = paragraph.getFirstChild();
      if (!$isTextNode(text)) throw new Error("expected TextNode in paragraph");
      expect(text.getTextContent()).toBe("- foo");
    });
  });

  // Ordered list marker: same cell-aware bail; without the wrap,
  // `| 1. foo |` would reload as an ordered ListNode in the cell and
  // silently rewrite the marker on next save.
  //
  // Before (on-disk):
  //   | 1. foo | bar |
  //   | --- | --- |
  //
  // After (byte-identical):
  //   | 1. foo | bar |
  //   | --- | --- |
  //
  // Cell tree state (cell 0, 0):
  //   TableCellNode
  //     ParagraphNode
  //       TextNode "1. foo"   ← NOT a ListNode
  test("a cell body of `1. foo` stays as literal text on round-trip (ORDERED_LIST cell-aware bail)", () => {
    const editor = createTestHeadlessEditor();
    const markdown = ["| 1. foo | bar |", "| --- | --- |"].join("\n");
    $setMarkdown(editor, markdown);
    expect($readMarkdown(editor)).toBe(markdown);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      const cell = getCell(table, 0, 0);
      expect(cell.getChildrenSize()).toBe(1);
      const paragraph = cell.getFirstChild();
      if (!$isParagraphNode(paragraph)) throw new Error("expected ParagraphNode in cell");
      const text = paragraph.getFirstChild();
      if (!$isTextNode(text)) throw new Error("expected TextNode in paragraph");
      expect(text.getTextContent()).toBe("1. foo");
    });
  });

  // Check list marker: STRICT_CHECK_LIST cell-aware bail — `| - [ ] foo |`
  // stays as literal text instead of becoming a check ListNode in the cell.
  //
  // Before (on-disk):
  //   | - [ ] foo | bar |
  //   | --- | --- |
  //
  // After (byte-identical):
  //   | - [ ] foo | bar |
  //   | --- | --- |
  //
  // Cell tree state (cell 0, 0):
  //   TableCellNode
  //     ParagraphNode
  //       TextNode "- [ ] foo"   ← NOT a check ListNode
  test("a cell body of `- [ ] foo` stays as literal text on round-trip (STRICT_CHECK_LIST cell-aware bail)", () => {
    const editor = createTestHeadlessEditor();
    const markdown = ["| - [ ] foo | bar |", "| --- | --- |"].join("\n");
    $setMarkdown(editor, markdown);
    expect($readMarkdown(editor)).toBe(markdown);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      const cell = getCell(table, 0, 0);
      expect(cell.getChildrenSize()).toBe(1);
      const paragraph = cell.getFirstChild();
      if (!$isParagraphNode(paragraph)) throw new Error("expected ParagraphNode in cell");
      const text = paragraph.getFirstChild();
      if (!$isTextNode(text)) throw new Error("expected TextNode in paragraph");
      expect(text.getTextContent()).toBe("- [ ] foo");
    });
  });

  // Horizontal rule marker stays literal in a cell — the HORIZONTAL_RULE
  // cell guard restores the matched marker onto the line's text node (the
  // upstream importer pre-slices the match off before our bail), so a cell
  // body starting with `---` reloads as `--- ...` text instead of an
  // empty cell.
  //
  // Before (on-disk):
  //   | --- text | b |
  //   | --- | --- |
  //
  // After (byte-identical):
  //   | --- text | b |
  //   | --- | --- |
  //
  // Cell tree state (cell 0, 0):
  //   TableCellNode
  //     ParagraphNode "--- text"   ← NOT a HorizontalRuleNode
  test("a cell body of `---` stays as literal text on round-trip (HORIZONTAL_RULE cell guard)", () => {
    const editor = createTestHeadlessEditor();
    const markdown = ["| --- text | b |", "| --- | --- |"].join("\n");
    $setMarkdown(editor, markdown);
    expect($readMarkdown(editor)).toBe(markdown);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      const cell = getCell(table, 0, 0);
      expect(cell.getChildrenSize()).toBe(1);
      const paragraph = cell.getFirstChild();
      if (!$isParagraphNode(paragraph)) throw new Error("expected ParagraphNode in cell");
      expect(paragraph.getTextContent()).toBe("--- text");
    });
  });

  // Quote marker stays literal in a cell — the CELL_AWARE_QUOTE wrapper
  // bails so `| > note | b |` doesn't build a QuoteNode inside the cell
  // (which would mix the quote key surface with cell navigation, and
  // break the `cork-quote p` margin reset).
  //
  // Before (on-disk):
  //   | > note | b |
  //   | --- | --- |
  //
  // After (byte-identical):
  //   | > note | b |
  //   | --- | --- |
  //
  // Cell tree state (cell 0, 0):
  //   TableCellNode
  //     ParagraphNode "> note"   ← NOT a QuoteNode
  test("a cell body of `> note` stays as literal text on round-trip (CELL_AWARE_QUOTE bail)", () => {
    const editor = createTestHeadlessEditor();
    const markdown = ["| > note | b |", "| --- | --- |"].join("\n");
    $setMarkdown(editor, markdown);
    expect($readMarkdown(editor)).toBe(markdown);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      const cell = getCell(table, 0, 0);
      expect(cell.getChildrenSize()).toBe(1);
      const paragraph = cell.getFirstChild();
      if (!$isParagraphNode(paragraph)) throw new Error("expected ParagraphNode in cell");
      expect(paragraph.getTextContent()).toBe("> note");
    });
  });

  // A cell body of literally `| x |` would otherwise re-match the TABLE
  // transformer's row regex on import (when cell bodies recurse through
  // MARKDOWN_TRANSFORMERS via $createTableCell) — the TABLE transformer's
  // cell guard restores the sliced marker so the body reloads as `| x |`
  // literal text instead of an empty cell.
  //
  // Before (on-disk — `\|` escapes the inner pipes so they don't split
  // the row into 4 cells):
  //   | \| x \| | b |
  //   | --- | --- |
  //
  // After (byte-identical; first cell holds literal `| x |` text):
  //   | \| x \| | b |
  //   | --- | --- |
  //
  // Cell tree state (cell 0, 0):
  //   TableCellNode "| x |"   ← NOT a nested TableNode
  test("a cell body of `| x |` stays as literal text on round-trip (TABLE transformer cell guard)", () => {
    const editor = createTestHeadlessEditor();
    const markdown = ["| \\| x \\| | b |", "| --- | --- |"].join("\n");
    $setMarkdown(editor, markdown);
    expect($readMarkdown(editor)).toBe(markdown);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // One row, two columns — the inner pipes didn't fragment the cell.
      expect(table.getChildrenSize()).toBe(1);
      const headerRow = table.getFirstChild();
      if (!$isTableRowNode(headerRow)) throw new Error("expected TableRowNode");
      expect(headerRow.getChildrenSize()).toBe(2);
      expect(getCell(table, 0, 0).getTextContent()).toBe("| x |");
    });
  });

  // Inline formatting inside a cell goes through the full transformer
  // pipeline (since `$createTableCell` recurses into MARKDOWN_TRANSFORMERS).
  // Bold survives the round-trip: the cell renders `bold` as
  // `<strong>bold</strong>` and re-emits `**bold**` on export.
  //
  // Before (on-disk):
  //   | **bold** | plain |
  //   | --- | --- |
  //
  // After (byte-identical; cell text becomes a bold TextNode that
  // re-serializes with the `**` markers on export):
  //   | **bold** | plain |
  //   | --- | --- |
  test("a cell body of `**bold**` round-trips with the bold marker preserved", () => {
    const editor = createTestHeadlessEditor();
    const markdown = ["| **bold** | plain |", "| --- | --- |"].join("\n");
    $setMarkdown(editor, markdown);
    expect($readMarkdown(editor)).toBe(markdown);
  });

  // Inline link inside a cell — the LINK transformer is preserved through
  // the cell recursion, so `[text](url)` survives round-trip.
  //
  // Before (on-disk):
  //   | [text](https://x.com) | b |
  //   | --- | --- |
  //
  // After (byte-identical; the cell holds a LinkNode wrapping "text"):
  //   | [text](https://x.com) | b |
  //   | --- | --- |
  test("a cell body of `[text](https://x.com)` round-trips with the link preserved", () => {
    const editor = createTestHeadlessEditor();
    const markdown = ["| [text](https://x.com) | b |", "| --- | --- |"].join("\n");
    $setMarkdown(editor, markdown);
    expect($readMarkdown(editor)).toBe(markdown);
  });

  // A pipe row WITHOUT a divider row is a malformed table (GFM requires a
  // header + divider). The editor preserves the literal source shape on
  // import — the single row stays as a header-less single-row TableNode
  // rather than being dropped or auto-promoted. On export the canonical
  // `| --- |` divider IS emitted because export always pads with one.
  // This documents the "no auto-promotion on import; canonical divider on
  // export" trade-off.
  //
  // Before (on-disk — pipe row only, no divider):
  //   | a | b |
  //
  // After (canonical divider added on export — first save rewrites to
  // valid GFM):
  //   | a | b |
  //   | --- | --- |
  //
  // Intermediate tree shape — header-LESS single row:
  //   TableNode
  //     TableRowNode
  //       TableCellNode (header=false) "a"
  //       TableCellNode (header=false) "b"
  test("a bare pipe row without a divider imports as a header-less table and exports with the canonical divider", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "| a | b |");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      expect(table.getChildrenSize()).toBe(1);
      // Headerless on import — first-row cells have no header state.
      expect(getCell(table, 0, 0).hasHeader()).toBe(false);
      expect(getCell(table, 0, 1).hasHeader()).toBe(false);
    });

    // Export always adds `| --- | --- |` after the first row so output is
    // valid GFM. The first-row cells stay as plain cells in the tree, but the
    // serialized output gains the canonical divider — a deliberate one-time
    // rewrite to make round-tripped files valid GFM.
    expect($readMarkdown(editor)).toBe(["| a | b |", "| --- | --- |"].join("\n"));
  });

  // Two tables separated by a blank line stay as TWO TableNodes (not
  // merged into one). The import-time merge only fuses adjacent rows; a
  // blank line creates a paragraph separator that breaks the chain.
  //
  // Before (on-disk):
  //   | a | b |
  //   | --- | --- |
  //   | 1 | 2 |
  //                  ← blank line separates the tables
  //   | x | y |
  //   | --- | --- |
  //   | 9 | 8 |
  //
  // After (byte-identical; two separate TableNodes):
  //   | a | b |
  //   | --- | --- |
  //   | 1 | 2 |
  //
  //   | x | y |
  //   | --- | --- |
  //   | 9 | 8 |
  test("two tables separated by a blank line stay as two separate TableNodes", () => {
    const editor = createTestHeadlessEditor();
    const markdown = [
      "| a | b |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "| x | y |",
      "| --- | --- |",
      "| 9 | 8 |",
    ].join("\n");
    $setMarkdown(editor, markdown);
    expect($readMarkdown(editor)).toBe(markdown);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      // Two tables; the blank line between them becomes an empty paragraph
      // that the standard markdown export round-trips as a blank line.
      const tables = root.getChildren().filter($isTableNode);
      expect(tables).toHaveLength(2);
      expect(tables[0].getChildrenSize()).toBe(2);
      expect(tables[1].getChildrenSize()).toBe(2);
    });
  });
});
