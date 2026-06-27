import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  type TableCellNode,
  type TableNode,
} from "@lexical/table";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isLineBreakNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  DELETE_LINE_COMMAND,
  type LexicalNode,
} from "lexical";
import { describe, expect, test } from "vitest";

import { dispatchCommand, dispatchKeyDown, renderTestEditor } from "./__tests__/utils";
import { TableKeyboardPlugin } from "./TableKeyboardPlugin";

// Coverage for TableKeyboardPlugin — the keyboard-only table editing layer.
// Each command (Tab, Enter, Backspace, vertical arrows, horizontal arrows,
// DeleteLine) lives in its own describe block; per-test fixtures seed a
// concrete table shape and verify the post-keystroke tree + selection.
//
// All structural handlers are registered at COMMAND_PRIORITY_CRITICAL so
// they win against TablePlugin's HIGH-priority built-ins. Each test asserts
// the contract this plugin guarantees, not the downstream behavior of the
// built-in handlers it intentionally defers to.
//
// Before/After diagrams in each test use GFM pipe notation. Since `|`
// doubles as the column delimiter, the cursor position is described in
// prose at the start of each block (e.g. "caret in cell (0, 1)") rather
// than embedded in the diagram.

// Build a header row + zero-or-more body rows. Cell text is the value at
// rows[r][c]; an empty string seeds an empty paragraph (so the cell is
// well-formed for selection but its content is empty per `$isCellEmpty`).
function $seedTable(rows: string[][]): TableNode {
  const table = $createTableNode();
  for (let r = 0; r < rows.length; r++) {
    const row = $createTableRowNode();
    for (const text of rows[r]) {
      const cell = $createTableCellNode(
        r === 0 ? TableCellHeaderStates.ROW : TableCellHeaderStates.NO_STATUS,
      );
      const paragraph = $createParagraphNode();
      if (text.length > 0) {
        paragraph.append($createTextNode(text));
      }
      cell.append(paragraph);
      row.append(cell);
    }
    table.append(row);
  }
  return table;
}

function getCell(table: TableNode, row: number, col: number): TableCellNode {
  const r = table.getChildAtIndex(row);
  if (!$isTableRowNode(r)) throw new Error(`expected TableRowNode at row ${row}`);
  const c = r.getChildAtIndex(col);
  if (!$isTableCellNode(c)) throw new Error(`expected TableCellNode at (${row}, ${col})`);
  return c;
}

// Walk up from the selection anchor to its enclosing TableCellNode. Used to
// verify "caret is in this cell" without depending on whether the anchor
// landed on the cell, its paragraph, or its TextNode descendant.
function $cellOfAnchor(): TableCellNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  let n: LexicalNode | null = selection.anchor.getNode();
  while (n != null && !$isTableCellNode(n)) {
    n = n.getParent();
  }
  return $isTableCellNode(n) ? n : null;
}

// Common plugin set — every test uses TablePlugin (so TableNode is a
// well-formed grid with the standard cell behaviors) + TableKeyboardPlugin
// (the unit under test). The HistoryPlugin etc. are already wired by
// renderTestEditor.
function tablePlugins() {
  return (
    <>
      <TablePlugin hasHorizontalScroll />
      <TableKeyboardPlugin />
    </>
  );
}

describe("TableKeyboardPlugin — Tab", () => {
  // Tab on the rightmost cell grows the grid by one column and steps into
  // the new cell. Every other row is backfilled with an empty cell so the
  // grid stays rectangular.
  //
  // Before — caret in rightmost header cell ("b"):
  //   | a | b |   ← header
  //   | c | d |
  //
  // After Tab — new column added, caret in the new (empty) header cell:
  //   | a | b |   |   ← header
  //   | c | d |   |
  test("Tab on the rightmost header cell adds a column to the right and moves caret into it", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([
          ["a", "b"],
          ["c", "d"],
        ]);
        root.append(table);
        getCell(table, 0, 1).selectStart(); // caret in rightmost header cell
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Tab");

    editor.getEditorState().read(() => {
      const table = $getRoot().getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      expect(table.getChildrenSize()).toBe(2);

      const headerRow = table.getChildAtIndex(0);
      if (!$isTableRowNode(headerRow)) throw new Error("expected TableRowNode at table[0]");
      // Header now has 3 cells: [a, b, empty].
      expect(headerRow.getChildrenSize()).toBe(3);

      // Every other row also got an empty cell appended — the grid is
      // still rectangular ($insertTableColumnAtSelection takes care of
      // backfilling).
      const bodyRow = table.getChildAtIndex(1);
      if (!$isTableRowNode(bodyRow)) throw new Error("expected TableRowNode at table[1]");
      expect(bodyRow.getChildrenSize()).toBe(3);

      const newHeader = getCell(table, 0, 2);
      // The appended header cell carries the same header state as the
      // sibling — $insertTableColumnAtSelection mirrors the header row.
      expect(newHeader.hasHeader()).toBe(true);
      expect(newHeader.getTextContent()).toBe("");

      // Caret in the new header cell, ready for typing.
      expect($cellOfAnchor()?.getKey()).toBe(newHeader.getKey());
    });
  });

  // Tab on a non-rightmost cell defers to TablePlugin's built-in
  // cell-navigation (our handler returns false). The grid shape stays
  // unchanged — only the caret moves one cell to the right.
  //
  // Before — caret in non-rightmost header cell ("a"):
  //   | a | b |
  //   | c | d |
  //
  // After Tab — no column added (built-in moves caret to "b"):
  //   | a | b |   ← still 2 cells (NO new column)
  //   | c | d |
  test("Tab on a non-rightmost cell does NOT grow the table (defers to built-in cell navigation)", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([
          ["a", "b"],
          ["c", "d"],
        ]);
        root.append(table);
        getCell(table, 0, 0).selectStart(); // caret in non-rightmost cell
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Tab");

    editor.getEditorState().read(() => {
      const table = $getRoot().getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // No new column — header still has 2 cells.
      const headerRow = table.getChildAtIndex(0);
      if (!$isTableRowNode(headerRow)) throw new Error("expected TableRowNode at table[0]");
      expect(headerRow.getChildrenSize()).toBe(2);
    });
  });

  // Shift+Tab is reserved for the built-in's reverse navigation; our handler
  // bails immediately on `event.shiftKey`. Shift+Tab on a rightmost cell must
  // NOT add a column.
  //
  // Before — caret in rightmost header cell ("b"):
  //   | a | b |
  //
  // After Shift+Tab — no column added (our handler bails on shiftKey):
  //   | a | b |   ← still 2 cells
  test("Shift+Tab on the rightmost cell does NOT add a column (our handler bails on shiftKey)", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([["a", "b"]]);
        root.append(table);
        getCell(table, 0, 1).selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Tab", { shiftKey: true });

    editor.getEditorState().read(() => {
      const table = $getRoot().getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      const headerRow = table.getFirstChild();
      if (!$isTableRowNode(headerRow)) throw new Error("expected TableRowNode at table[0]");
      // No column added.
      expect(headerRow.getChildrenSize()).toBe(2);
    });
  });
});

describe("TableKeyboardPlugin — Enter", () => {
  // Enter on a body cell adds an empty row below at the SAME column index
  // and parks the caret in the new cell. The original cell content is not
  // split — the row is inserted whole.
  //
  // Before — caret in body cell ("d", col 1):
  //   | a | b |   ← header
  //   | c | d |   ← caret here
  //
  // After Enter — new empty row appended, caret in same column (col 1):
  //   | a | b |
  //   | c | d |
  //   |   |   |   ← new empty body row, caret in col 1
  test("Enter on a body cell adds an empty row below and moves caret to the same column in the new row", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([
          ["a", "b"],
          ["c", "d"],
        ]);
        root.append(table);
        getCell(table, 1, 1).selectStart(); // caret in body cell, column 1
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Enter");

    editor.getEditorState().read(() => {
      const table = $getRoot().getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // 3 rows now: header + original body row + new empty body row.
      expect(table.getChildrenSize()).toBe(3);

      const newRow = table.getChildAtIndex(2);
      if (!$isTableRowNode(newRow)) throw new Error("expected TableRowNode at table[2]");
      expect(newRow.getChildrenSize()).toBe(2);
      const newCellCol1 = getCell(table, 2, 1);
      expect(newCellCol1.getTextContent()).toBe("");
      expect(newCellCol1.hasHeader()).toBe(false);

      // Original cells untouched.
      expect(getCell(table, 1, 0).getTextContent()).toBe("c");
      expect(getCell(table, 1, 1).getTextContent()).toBe("d");

      // Caret in the new row, SAME column index as the caret was in.
      expect($cellOfAnchor()?.getKey()).toBe(newCellCol1.getKey());
    });
  });

  // Shift+Enter inserts an in-cell line break (LineBreakNode) instead of
  // adding a row — same channel as Shift+Enter in a normal paragraph but
  // it doesn't escape the cell.
  //
  // Before — caret at end of "body" in body cell:
  //   | a    |
  //   | body |   ← caret at end of "body"
  //
  // After Shift+Enter — line break appended inside the cell, NO new row:
  //   | a    |
  //   | body |   (paragraph now holds: TextNode "body" + LineBreakNode)
  test("Shift+Enter inserts an in-cell line break and does NOT add a row", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([["a"], ["body"]]);
        root.append(table);
        getCell(table, 1, 0).selectEnd(); // caret after "body"
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Enter", { shiftKey: true });

    editor.getEditorState().read(() => {
      const table = $getRoot().getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // Still 2 rows — no new row added.
      expect(table.getChildrenSize()).toBe(2);

      const bodyCell = getCell(table, 1, 0);
      const paragraph = bodyCell.getFirstChild();
      if (!$isParagraphNode(paragraph)) throw new Error("expected ParagraphNode in body cell");
      // Paragraph now contains: TextNode "body" + LineBreakNode.
      expect(paragraph.getChildrenSize()).toBe(2);
      const lineBreak = paragraph.getLastChild();
      expect($isLineBreakNode(lineBreak)).toBe(true);
    });
  });

  // Enter on a trailing empty body row drops that row and exits below to a
  // fresh paragraph — prevents Enter from stacking empty rows endlessly when
  // the user wants out of the table.
  //
  // Before — caret in trailing empty body row:
  //   | a | b |   ← header
  //   | c | d |
  //   |   |   |   ← caret here (empty trailing row)
  //
  // After Enter — empty row dropped, new paragraph below, caret in paragraph:
  //   | a | b |
  //   | c | d |
  //   (paragraph "")   ← caret here
  test("Enter on a trailing empty body row drops the row and exits to a fresh paragraph below the table", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([
          ["a", "b"],
          ["c", "d"],
          ["", ""], // trailing empty body row
        ]);
        root.append(table);
        getCell(table, 2, 0).selectStart(); // caret in the empty row
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Enter");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      // root: [table, new paragraph].
      expect(root.getChildrenSize()).toBe(2);

      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // 2 rows now — trailing empty body was dropped.
      expect(table.getChildrenSize()).toBe(2);
      expect(getCell(table, 0, 0).getTextContent()).toBe("a");
      expect(getCell(table, 1, 0).getTextContent()).toBe("c");

      const newParagraph = root.getChildAtIndex(1);
      if (!$isParagraphNode(newParagraph)) throw new Error("expected ParagraphNode at root[1]");
      expect(newParagraph.getTextContent()).toBe("");

      // Caret in the new paragraph (no longer in any cell).
      expect($cellOfAnchor()).toBeNull();
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      const anchorParagraph = $isParagraphNode(selection.anchor.getNode())
        ? selection.anchor.getNode()
        : selection.anchor.getNode().getParent();
      expect(anchorParagraph?.getKey()).toBe(newParagraph.getKey());
    });
  });

  // Enter on an EMPTY HEADER row is NOT an exit — header rows are protected
  // (`!$isHeaderRow(row)` gate fails). Falls through to the row-insert path,
  // appending an empty body row below the header.
  //
  // Before — caret in only cell of a header-only empty table:
  //   |   |   ← caret here (header row, empty)
  //
  // After Enter — header NOT removed; new body row appended:
  //   |   |   ← header (still empty)
  //   |   |   ← new body row
  test("Enter on an empty header row falls through to inserting a body row (no exit, header protected)", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        // Header-only table with a single empty cell.
        const table = $seedTable([[""]]);
        root.append(table);
        getCell(table, 0, 0).selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Enter");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      // Table still alive — header row wasn't exit-removed.
      expect(root.getChildrenSize()).toBe(1);
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // A new body row was inserted below the header (the row-insert
      // fallthrough). The header row stays put.
      expect(table.getChildrenSize()).toBe(2);
      expect(getCell(table, 0, 0).hasHeader()).toBe(true);
      expect(getCell(table, 1, 0).hasHeader()).toBe(false);
    });
  });

  // Enter on a trailing empty body row when the table has [header + this
  // body]: the body row goes, but the header survives. Whole-table removal
  // only kicks in when the row to drop is the ONLY child of the table.
  //
  // Before — caret in trailing empty body row of [header "a", empty body]:
  //   | a |   ← header
  //   |   |   ← caret here (empty body)
  //
  // After Enter — body dropped, table left as header-only:
  //   | a |
  //   (paragraph "")   ← caret here
  test("Enter on a trailing empty body row keeps the (header-only) table when there are other rows", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([["a"], [""]]);
        root.append(table);
        getCell(table, 1, 0).selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Enter");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      // root: [table, new paragraph].
      expect(root.getChildrenSize()).toBe(2);
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // Header-only table left behind.
      expect(table.getChildrenSize()).toBe(1);
      expect(getCell(table, 0, 0).hasHeader()).toBe(true);
      expect(getCell(table, 0, 0).getTextContent()).toBe("a");
    });
  });
});

describe("TableKeyboardPlugin — Backspace", () => {
  // Backspace in an empty cell whose column is also empty → delete the whole
  // column. The header cell AND every body cell in that column go; the grid
  // stays rectangular. Caret hops to end of the cell to the left.
  //
  // Before — caret in empty middle header cell (col 1):
  //   | a |   | c |   ← caret in middle header
  //   | d |   | f |
  //
  // After Backspace — middle column deleted; caret at end of left cell ("a"):
  //   | a | c |
  //   | d | f |
  test("Backspace in an empty middle column deletes the entire column", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([
          ["a", "", "c"],
          ["d", "", "f"],
        ]);
        root.append(table);
        getCell(table, 0, 1).selectStart(); // caret in empty middle header
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Backspace");

    editor.getEditorState().read(() => {
      const table = $getRoot().getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // 2 columns now.
      expect(table.getChildrenSize()).toBe(2);
      const headerRow = table.getChildAtIndex(0);
      if (!$isTableRowNode(headerRow)) throw new Error("expected TableRowNode at table[0]");
      expect(headerRow.getChildrenSize()).toBe(2);
      expect(getCell(table, 0, 0).getTextContent()).toBe("a");
      expect(getCell(table, 0, 1).getTextContent()).toBe("c");

      const bodyRow = table.getChildAtIndex(1);
      if (!$isTableRowNode(bodyRow)) throw new Error("expected TableRowNode at table[1]");
      expect(bodyRow.getChildrenSize()).toBe(2);
      expect(getCell(table, 1, 0).getTextContent()).toBe("d");
      expect(getCell(table, 1, 1).getTextContent()).toBe("f");

      // Caret hopped to end of the cell on the left (header "a").
      expect($cellOfAnchor()?.getKey()).toBe(getCell(table, 0, 0).getKey());
    });
  });

  // Backspace in an empty cell whose column has content elsewhere → don't
  // delete the column; just hop to end of the cell on the left. This is the
  // "I'm in an empty cell, get me back to where I was typing" channel.
  //
  // Before — caret in empty header (col 1); body has "d" in same column:
  //   | a |   |   ← caret in empty header (col 1)
  //   | c | d |   ← body cell "d" keeps column non-empty
  //
  // After Backspace — grid unchanged, caret hops to end of "a":
  //   | a |   |
  //   | c | d |
  test("Backspace in an empty non-leftmost cell whose column has content hops to end of the cell on its left", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        // Column 1 has body content "d" — column is NOT empty, so the
        // empty header cell only triggers the left-hop, not column delete.
        const table = $seedTable([
          ["a", ""],
          ["c", "d"],
        ]);
        root.append(table);
        getCell(table, 0, 1).selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Backspace");

    editor.getEditorState().read(() => {
      const table = $getRoot().getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // Grid shape unchanged.
      expect(table.getChildrenSize()).toBe(2);
      const headerRow = table.getChildAtIndex(0);
      if (!$isTableRowNode(headerRow)) throw new Error("expected TableRowNode at table[0]");
      expect(headerRow.getChildrenSize()).toBe(2);

      // Caret hopped to the cell on the left (header "a").
      expect($cellOfAnchor()?.getKey()).toBe(getCell(table, 0, 0).getKey());
    });
  });

  // Backspace in the leftmost empty cell of an empty body row → delete the
  // row. Header rows aren't touched by this path; caret lifts up to the row
  // above's first cell (matching backspace's leftward motion).
  //
  // Before — caret in leftmost empty body cell (row 1, col 0):
  //   | a | b |   ← header
  //   |   |   |   ← caret here (empty body row)
  //
  // After Backspace — empty body row deleted; caret at end of header "a":
  //   | a | b |
  test("Backspace in the leftmost empty cell of an empty body row deletes the row and lifts caret one row up", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([
          ["a", "b"],
          ["", ""],
        ]);
        root.append(table);
        getCell(table, 1, 0).selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Backspace");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // Only header left.
      expect(table.getChildrenSize()).toBe(1);
      expect(getCell(table, 0, 0).getTextContent()).toBe("a");

      // Caret moved to the row above's first cell (the header cell "a"),
      // matching the leftward motion of backspace.
      expect($cellOfAnchor()?.getKey()).toBe(getCell(table, 0, 0).getKey());
    });
  });

  // Backspace in an empty header row when body rows still exist → no-op.
  // Header rows are protected (`$isHeaderRow(row) && $hasBodyRow(table)`
  // returns false from the handler). Structural state stays unchanged so
  // an accidental Backspace can't drop the header silently.
  //
  // Before — caret in leftmost empty header cell; body has content:
  //   |   |   |   ← caret here (empty header)
  //   | a | b |   ← body has content
  //
  // After Backspace — no-op (header protected):
  //   |   |   |   ← unchanged
  //   | a | b |
  test("Backspace in the leftmost empty header cell is a no-op when body rows exist (header protection)", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([
          ["", ""],
          ["a", "b"],
        ]);
        root.append(table);
        getCell(table, 0, 0).selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Backspace");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      // Structural state unchanged — both rows still there.
      expect(root.getChildrenSize()).toBe(1);
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      expect(table.getChildrenSize()).toBe(2);
      const headerRow = table.getChildAtIndex(0);
      if (!$isTableRowNode(headerRow)) throw new Error("expected TableRowNode at table[0]");
      expect(headerRow.getChildrenSize()).toBe(2);
      expect(getCell(table, 1, 0).getTextContent()).toBe("a");
    });
  });

  // Backspace in the only cell of a 1x1 empty header table → remove the
  // whole table. Header protection lifts when `$hasBodyRow` returns false,
  // AND the column-delete path's `row.getChildrenSize() > 1` guard skips
  // (single-cell row), so we fall straight to the row-delete + $removeTable
  // path. A fresh empty paragraph replaces the table at root.
  //
  // Before — caret in only cell of a 1x1 empty header table:
  //   |   |   ← caret here (single empty header cell)
  //
  // After Backspace — table removed, replaced by empty paragraph:
  //   (paragraph "")   ← caret here
  test("Backspace in the only empty cell of a single-cell header-only table removes the whole table", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        // Single row, single cell — the column-delete path's
        // `row.getChildrenSize() > 1` guard is the gate that keeps multi-cell
        // empty tables on the "delete the column first" path; with one cell
        // we drop straight to the row + whole-table delete path.
        const table = $seedTable([[""]]);
        root.append(table);
        getCell(table, 0, 0).selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Backspace");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      // Table gone, fresh paragraph in its place.
      expect(root.getChildrenSize()).toBe(1);
      const child = root.getFirstChild();
      if (!$isParagraphNode(child)) throw new Error("expected ParagraphNode at root[0]");
      expect($isTableNode(child)).toBe(false);
      expect(child.getTextContent()).toBe("");
      // Caret in the new paragraph.
      expect($cellOfAnchor()).toBeNull();
    });
  });

  // Backspace in a non-empty cell → our handler returns false; the grid is
  // left alone and the default char-delete handles the keystroke. Only
  // empty cells trigger structural backspace.
  //
  // Before — caret at start of body cell "d" (cell is non-empty):
  //   | a | b |
  //   | c | d |   ← caret at start of "d"
  //
  // After Backspace — grid intact (default char-delete handles it):
  //   | a | b |
  //   | c | d |   ← grid shape unchanged
  test("Backspace in a non-empty cell does NOT trigger structural delete (defers to default char delete)", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([
          ["a", "b"],
          ["c", "d"],
        ]);
        root.append(table);
        getCell(table, 1, 1).selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Backspace");

    editor.getEditorState().read(() => {
      const table = $getRoot().getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // Grid shape intact — neither column nor row was deleted.
      expect(table.getChildrenSize()).toBe(2);
      const headerRow = table.getChildAtIndex(0);
      if (!$isTableRowNode(headerRow)) throw new Error("expected TableRowNode at table[0]");
      expect(headerRow.getChildrenSize()).toBe(2);
    });
  });
});

describe("TableKeyboardPlugin — Vertical arrows", () => {
  // Table at document start + ArrowUp from a top-row cell → escape above
  // into a fresh paragraph. Without this, the user couldn't reach a spot
  // above a leading table by keyboard.
  //
  // Before — caret in top row of a table that's the document's first block:
  //   | a |   ← caret here (top row of leading table)
  //
  // After ArrowUp — new paragraph inserted ABOVE the table, caret in it:
  //   (paragraph "")   ← caret here
  //   | a |
  test("ArrowUp on the top row of a table at the document start escapes above to a fresh paragraph", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([["a"]]);
        root.append(table);
        getCell(table, 0, 0).selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "ArrowUp");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      // [paragraph, table].
      expect(root.getChildrenSize()).toBe(2);
      const para = root.getChildAtIndex(0);
      if (!$isParagraphNode(para)) throw new Error("expected ParagraphNode at root[0]");
      expect(para.getTextContent()).toBe("");
      expect($isTableNode(root.getChildAtIndex(1))).toBe(true);

      // Caret in the new paragraph.
      expect($cellOfAnchor()).toBeNull();
    });
  });

  // Table at document end + ArrowDown from a bottom-row cell → escape
  // below into a fresh paragraph. Mirror of the ArrowUp doc-start case.
  //
  // Before — caret in bottom row of a table that's the document's last block:
  //   | a |
  //   | c |   ← caret here (bottom row)
  //
  // After ArrowDown — new paragraph inserted BELOW the table, caret in it:
  //   | a |
  //   | c |
  //   (paragraph "")   ← caret here
  test("ArrowDown on the bottom row of a table at the document end escapes below to a fresh paragraph", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([["a"], ["c"]]);
        root.append(table);
        getCell(table, 1, 0).selectStart(); // bottom row
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "ArrowDown");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(2);
      expect($isTableNode(root.getChildAtIndex(0))).toBe(true);
      const para = root.getChildAtIndex(1);
      if (!$isParagraphNode(para)) throw new Error("expected ParagraphNode at root[1]");
      expect(para.getTextContent()).toBe("");
    });
  });

  // Table with a sibling block ABOVE it + ArrowUp on top row → our handler
  // returns false (not a doc-edge case); the built-in moves to the
  // adjacent block above. The plugin's job is to NOT insert a fresh
  // paragraph — the block above already exists.
  //
  // Before — caret in top row of a table that follows a paragraph:
  //   above
  //   | a |   ← caret here (top row)
  //
  // After ArrowUp — no new paragraph inserted (defers to built-in):
  //   above
  //   | a |   ← root still [paragraph "above", table]
  test("ArrowUp on the top row of a table with a paragraph above does NOT insert a new paragraph (defers to default)", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const para = $createParagraphNode();
        para.append($createTextNode("above"));
        root.append(para);
        const table = $seedTable([["a"]]);
        root.append(table);
        getCell(table, 0, 0).selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "ArrowUp");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      // root stays at [paragraph, table] — no new paragraph inserted.
      expect(root.getChildrenSize()).toBe(2);
      const firstPara = root.getChildAtIndex(0);
      if (!$isParagraphNode(firstPara)) throw new Error("expected ParagraphNode at root[0]");
      expect(firstPara.getTextContent()).toBe("above");
      expect($isTableNode(root.getChildAtIndex(1))).toBe(true);
    });
  });

  // ArrowUp from a paragraph immediately below a table → enter the table
  // at its LAST row's FIRST cell. The plugin overrides this case so the
  // caret doesn't jump to wherever native caret-x lands (which would
  // typically be the right edge of the table).
  //
  // Before — caret at start of a paragraph that sits right below a table:
  //   | a | b |
  //   | c | d |
  //   (paragraph)   ← caret at start of paragraph
  //
  // After ArrowUp — caret enters the table at LAST row's FIRST cell ("c"):
  //   | a | b |
  //   | c | d |   ← caret here (last row, col 0 — NOT col 1)
  //   (paragraph)
  test("ArrowUp from a paragraph immediately below a table enters the last row's first cell", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([
          ["a", "b"],
          ["c", "d"],
        ]);
        root.append(table);
        const para = $createParagraphNode();
        root.append(para);
        para.selectStart(); // caret at start of paragraph below table
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "ArrowUp");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // Caret lands in the last row's FIRST cell ("c"), not wherever
      // native vertical caret-x happened to point.
      const expectedCell = getCell(table, 1, 0);
      expect($cellOfAnchor()?.getKey()).toBe(expectedCell.getKey());
    });
  });

  // A modifier (Shift/Alt/Meta/Ctrl) suppresses both the doc-edge escape
  // AND the enter-from-below — those would interfere with extend-selection
  // and word-jump shortcuts. Plugin returns false; structural state stays.
  //
  // Before — caret in top row of a leading table:
  //   | a |   ← caret here
  //
  // After Shift+ArrowUp — no new paragraph (modifier bail):
  //   | a |   ← root still just [table]
  test("Shift+ArrowUp on the top row of a leading table does NOT insert a fresh paragraph (modifier bail)", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([["a"]]);
        root.append(table);
        getCell(table, 0, 0).selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "ArrowUp", { shiftKey: true });

    editor.getEditorState().read(() => {
      const root = $getRoot();
      // root unchanged — only the table.
      expect(root.getChildrenSize()).toBe(1);
      expect($isTableNode(root.getFirstChild())).toBe(true);
    });
  });
});

describe("TableKeyboardPlugin — Horizontal arrows", () => {
  // ArrowRight at the END of the rightmost cell → swallow the key (return
  // true + preventDefault). Without this, the caret would wrap into the
  // adjacent row or escape the table to the right; the plugin enforces
  // "use up/down to leave a row, not right past its end".
  //
  // Before — caret at END of rightmost cell ("b"):
  //   | a | b |   ← caret at end of "b" (rightmost cell)
  //   | c | d |
  //
  // After ArrowRight — swallowed; caret stays put:
  //   | a | b |   ← caret still at end of "b"
  //   | c | d |
  test("ArrowRight at the end of the rightmost cell swallows the key (no caret movement out of cell)", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([
          ["a", "b"],
          ["c", "d"],
        ]);
        root.append(table);
        getCell(table, 0, 1).selectEnd(); // caret at end of rightmost cell
      },
      { discrete: true },
    );

    const handled = dispatchKeyDown(editor, "ArrowRight");
    expect(handled).toBe(true);

    editor.getEditorState().read(() => {
      const table = $getRoot().getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // Caret still in the same cell ("b").
      expect($cellOfAnchor()?.getKey()).toBe(getCell(table, 0, 1).getKey());
    });
  });

  // ArrowLeft at the START of the leftmost cell → swallow the key. Mirror
  // of the right-edge case — caret stays put rather than wrap into the row
  // above.
  //
  // Before — caret at START of leftmost cell ("a"):
  //   | a | b |   ← caret at start of "a"
  //   | c | d |
  //
  // After ArrowLeft — swallowed; caret stays put:
  //   | a | b |   ← caret still at start of "a"
  //   | c | d |
  test("ArrowLeft at the start of the leftmost cell swallows the key (no caret movement out of cell)", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([
          ["a", "b"],
          ["c", "d"],
        ]);
        root.append(table);
        getCell(table, 0, 0).selectStart(); // caret at start of leftmost cell
      },
      { discrete: true },
    );

    const handled = dispatchKeyDown(editor, "ArrowLeft");
    expect(handled).toBe(true);

    editor.getEditorState().read(() => {
      const table = $getRoot().getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      expect($cellOfAnchor()?.getKey()).toBe(getCell(table, 0, 0).getKey());
    });
  });

  // ArrowRight in the MIDDLE of a cell (not at the end) → defer to the
  // default handler (our plugin returns false). The plugin only swallows
  // at row edges; normal intra-cell navigation must keep working.
  //
  // Before — caret in middle of "abc" (offset 1, between "a" and "bc"):
  //   | a|bc |   ← caret between "a" and "bc" (cell is the only cell)
  //
  // After ArrowRight — our plugin returns false (defers to default):
  //   (return value alone is the contract here; the built-in moves the
  //   caret one char right within the cell)
  test("ArrowRight in the middle of a cell does NOT swallow (defers to default)", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([["abc"]]);
        root.append(table);
        // Caret at offset 1 inside "abc" — not at start or end.
        const cell = getCell(table, 0, 0);
        const paragraph = cell.getFirstChild();
        if (!$isParagraphNode(paragraph)) throw new Error("expected ParagraphNode");
        const textNode = paragraph.getFirstChild();
        if (!$isTextNode(textNode)) throw new Error("expected TextNode in cell");
        textNode.select(1, 1);
      },
      { discrete: true },
    );

    const handled = dispatchKeyDown(editor, "ArrowRight");
    // Plugin returns false; whether any downstream handler returns true is
    // up to them — what matters is our plugin doesn't claim ownership of
    // intra-cell navigation.
    expect(handled).toBe(false);
  });
});

describe("TableKeyboardPlugin — DELETE_LINE", () => {
  // Cmd/Ctrl+Backspace dispatches DELETE_LINE_COMMAND. TablePlugin punts on
  // this inside cells ("TODO: Fix Delete Line in Table Cells") — its
  // built-in would fall back to deleteCharacter and merge the cell into a
  // neighbour. Our handler reimplements delete-to-line-start WITHOUT the
  // cell-escaping fallback, so the cell boundary is never crossed.
  //
  // Before — caret at END of "hello" in the only cell:
  //   | hello |   ← caret at end of "hello"
  //
  // After DELETE_LINE_COMMAND(backward=true) — cell content removed, grid intact:
  //   |   |   ← cell empty, no cell merged with a neighbour
  test("DELETE_LINE_COMMAND inside a cell deletes to line start without escaping the cell", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTable([["hello"]]);
        root.append(table);
        getCell(table, 0, 0).selectEnd(); // caret at end of "hello"
      },
      { discrete: true },
    );

    // isBackward = true → delete from caret back to line start.
    dispatchCommand(editor, DELETE_LINE_COMMAND, true);

    editor.getEditorState().read(() => {
      const table = $getRoot().getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // Cell content removed.
      const cell = getCell(table, 0, 0);
      expect(cell.getTextContent()).toBe("");
      // Grid shape unchanged (no cell merged with a neighbor).
      const headerRow = table.getChildAtIndex(0);
      if (!$isTableRowNode(headerRow)) throw new Error("expected TableRowNode at table[0]");
      expect(headerRow.getChildrenSize()).toBe(1);
    });
  });

  // DELETE_LINE_COMMAND outside any cell → defer to default. Our handler
  // returns false; RangeSelection.deleteLine takes over.
  //
  // Before — caret at end of paragraph "plain":
  //   plain|   ← caret at end
  //
  // After DELETE_LINE_COMMAND(backward=true) — line cleared by default handler:
  //   (paragraph "")   ← caret at start of empty paragraph
  test("DELETE_LINE_COMMAND outside any cell defers to the default handler (returns false from our plugin)", async () => {
    const { editor } = await renderTestEditor({ plugins: tablePlugins() });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const para = $createParagraphNode();
        para.append($createTextNode("plain"));
        root.append(para);
        para.selectEnd();
      },
      { discrete: true },
    );

    // We can't easily assert the plugin's return value vs. downstream
    // handler's; but we can assert the post-state matches the default
    // behavior (the line content was deleted).
    dispatchCommand(editor, DELETE_LINE_COMMAND, true);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const para = root.getFirstChild();
      if (!$isParagraphNode(para)) throw new Error("expected ParagraphNode at root[0]");
      expect(para.getTextContent()).toBe("");
    });
  });
});
