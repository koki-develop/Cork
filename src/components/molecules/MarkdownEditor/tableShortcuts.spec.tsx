import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import {
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  type TableCellNode,
  type TableNode,
} from "@lexical/table";
import { $getRoot, $getSelection, $isRangeSelection, type LexicalNode } from "lexical";
import { describe, expect, test } from "vitest";

import { renderTestEditor } from "./__tests__/utils";
import { TableKeyboardPlugin } from "./TableKeyboardPlugin";
import { MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS } from "./transformers";

// Live-typing coverage for the TABLE element transformer's two commit shapes:
//
//   - Space-commit (`| a | `): when the trailing trigger char is a space,
//     upstream's runElementTransformers fires the transformer with match[0]
//     ending in the space; the TABLE replace path then calls
//     $seedHeaderColumn — the row is promoted to a header and an empty
//     header cell is appended, caret parked there so the user can keep
//     naming columns.
//   - Enter-commit (`| a |` then Enter): MarkdownShortcutPlugin's
//     KEY_ENTER_COMMAND handler fires the transformer with match[0] NOT
//     ending in space (`triggerOnEnter: true` bypasses the trailing-space
//     check); the TABLE replace path then calls $seedBodyRow — the row is
//     promoted to a header AND an empty body row is appended, caret in
//     the first body cell so the user can immediately fill it.
//
// Note: upstream `runElementTransformers` REQUIRES the last typed char to
// be a space (when not Enter-triggered), so the transformer NEVER fires
// from typing `| a |` alone — the cell is grown column-by-column via Tab
// after the first space- or Enter-commit (covered in TableKeyboardPlugin
// tests). Typing `| a | b |` live ends up as a 1-cell table whose body
// cell collects the trailing ` b | ` typed AFTER the header-cell space
// trigger — a curious but documented behavior; multi-column tables get
// built via the import path or via Tab after creation.
//
// Before/After diagrams use GFM pipe notation. Since `|` is the column
// delimiter, the cursor position is described in prose at the start of
// each block rather than embedded in the diagram.

function getCell(table: TableNode, row: number, col: number): TableCellNode {
  const r = table.getChildAtIndex(row);
  if (!$isTableRowNode(r)) throw new Error(`expected TableRowNode at row ${row}`);
  const c = r.getChildAtIndex(col);
  if (!$isTableCellNode(c)) throw new Error(`expected TableCellNode at (${row}, ${col})`);
  return c;
}

// Walk up from the selection anchor to the enclosing TableCellNode. Used to
// assert "caret is in this specific cell" without depending on whether the
// anchor landed on the cell's paragraph or its TextNode descendant.
function $cellOfAnchor(): TableCellNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  let n: LexicalNode | null = selection.anchor.getNode();
  while (n != null && !$isTableCellNode(n)) {
    n = n.getParent();
  }
  return $isTableCellNode(n) ? n : null;
}

describe("Table creation shortcut (live typing)", () => {
  // Space-commit grows the row by one empty header cell — no body row yet.
  // Caret parks at the start of the new empty cell so the user can keep
  // typing column names.
  //
  // Before — empty editor:
  //   (paragraph "")   ← caret at root
  //
  // After typing `| a | ` (space-commit) — 1-row table, new empty col, caret in new col:
  //   | a |   |   ← header (caret in new empty cell, col 1)
  test("typing `| a | ` (space-commit) promotes the row to a header and appends an empty header cell", async () => {
    const { editor, screen, user } = await renderTestEditor({
      plugins: (
        <>
          <TablePlugin hasHorizontalScroll />
          <TableKeyboardPlugin />
          <MarkdownShortcutPlugin transformers={MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS} />
        </>
      ),
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);
    await user.keyboard("| a | ");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // Single row — header only; no body row was seeded on space-commit.
      expect(table.getChildrenSize()).toBe(1);

      const headerRow = table.getFirstChild();
      if (!$isTableRowNode(headerRow)) throw new Error("expected TableRowNode at table[0]");
      // 2 cells now: the typed "a" + the new empty header column.
      expect(headerRow.getChildrenSize()).toBe(2);

      const cellA = getCell(table, 0, 0);
      const cellEmpty = getCell(table, 0, 1);
      // Both cells are header cells — $seedHeaderColumn creates the new
      // column with `TableCellHeaderStates.ROW`, and $promoteHeader sets
      // the original cell's header state too. So the entire row is uniform.
      expect(cellA.hasHeader()).toBe(true);
      expect(cellEmpty.hasHeader()).toBe(true);
      expect(cellA.getTextContent()).toBe("a");
      expect(cellEmpty.getTextContent()).toBe("");

      // Caret in the new empty header cell, ready for the user to type
      // the next column name.
      expect($cellOfAnchor()?.getKey()).toBe(cellEmpty.getKey());
    });
  });

  // Enter-commit promotes the row to a header AND seeds an empty body row;
  // caret lands in the first body cell so the user can fill it. This is
  // the "I'm done with the header — now start the body" workflow.
  //
  // Before — empty editor:
  //   (paragraph "")   ← caret at root
  //
  // After typing `| a |` then Enter — header row + empty body row, caret in body:
  //   | a |   ← header
  //   |   |   ← new empty body row (caret in col 0)
  test("typing `| a |` then Enter (enter-commit) promotes the row to a header and seeds a body row below", async () => {
    const { editor, screen, user } = await renderTestEditor({
      plugins: (
        <>
          <TablePlugin hasHorizontalScroll />
          <TableKeyboardPlugin />
          <MarkdownShortcutPlugin transformers={MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS} />
        </>
      ),
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);
    await user.keyboard("| a |{Enter}");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // 2 rows: header + body. Both single-cell — Tab grows columns later.
      expect(table.getChildrenSize()).toBe(2);

      const headerRow = table.getChildAtIndex(0);
      if (!$isTableRowNode(headerRow)) throw new Error("expected TableRowNode at table[0]");
      expect(headerRow.getChildrenSize()).toBe(1);
      const headerCell = getCell(table, 0, 0);
      expect(headerCell.hasHeader()).toBe(true);
      expect(headerCell.getTextContent()).toBe("a");

      const bodyRow = table.getChildAtIndex(1);
      if (!$isTableRowNode(bodyRow)) throw new Error("expected TableRowNode at table[1]");
      expect(bodyRow.getChildrenSize()).toBe(1);
      const bodyCell = getCell(table, 1, 0);
      expect(bodyCell.hasHeader()).toBe(false);
      expect(bodyCell.getTextContent()).toBe("");

      // Caret in the first body cell, ready for the user to type the first
      // body cell's content.
      expect($cellOfAnchor()?.getKey()).toBe(bodyCell.getKey());
    });
  });

  // After Enter-commit seeds the body row, the next typed chars land in
  // the body cell — verifies the caret really lands in a typing-ready
  // cell, not just structurally inside the cell.
  //
  // Before — empty editor:
  //   (paragraph "")   ← caret at root
  //
  // After typing `| a |{Enter}body`:
  //   | a    |   ← header
  //   | body |   ← body, caret at end of "body"
  test("after the Enter-commit seeds the body row, the next typed chars land in the body cell", async () => {
    const { editor, screen, user } = await renderTestEditor({
      plugins: (
        <>
          <TablePlugin hasHorizontalScroll />
          <TableKeyboardPlugin />
          <MarkdownShortcutPlugin transformers={MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS} />
        </>
      ),
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);
    await user.keyboard("| a |{Enter}body");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      expect(table.getChildrenSize()).toBe(2);
      expect(getCell(table, 0, 0).getTextContent()).toBe("a");
      // Body cell filled by the typed "body" — confirms the caret really
      // lands inside the body cell after seedBodyRow, not somewhere stale.
      expect(getCell(table, 1, 0).getTextContent()).toBe("body");
    });
  });

  // After space-commit seeds the new empty header column, typed chars land
  // in the NEW header cell — confirms $seedHeaderColumn's `selectStart()`
  // really parks the caret in the appended cell, not back in the cell
  // that was already there.
  //
  // Before — empty editor:
  //   (paragraph "")   ← caret at root
  //
  // After typing `| a | b` — space-commit creates 2-cell header, then `b`
  // is typed into the new (empty) cell:
  //   | a | b |   ← header (caret at end of "b" in col 1)
  test("after the space-commit seeds an empty header cell, the next typed chars land in the new cell", async () => {
    const { editor, screen, user } = await renderTestEditor({
      plugins: (
        <>
          <TablePlugin hasHorizontalScroll />
          <TableKeyboardPlugin />
          <MarkdownShortcutPlugin transformers={MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS} />
        </>
      ),
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);
    await user.keyboard("| a | b");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // 1 row — body row not seeded on space-commit.
      expect(table.getChildrenSize()).toBe(1);
      // 2 cells: "a" and "b" (the new empty header column got the typed "b").
      const headerRow = table.getFirstChild();
      if (!$isTableRowNode(headerRow)) throw new Error("expected TableRowNode at table[0]");
      expect(headerRow.getChildrenSize()).toBe(2);
      expect(getCell(table, 0, 0).getTextContent()).toBe("a");
      expect(getCell(table, 0, 1).getTextContent()).toBe("b");
      expect(getCell(table, 0, 1).hasHeader()).toBe(true);
    });
  });

  // MarkdownShortcutPlugin's $runElementTransformers bails when the
  // grandparent isn't root (upstream's `$isRootOrShadowRoot(grandParentNode)`
  // guard), so a pipe row typed INSIDE a table cell can't fire the TABLE
  // transformer — the typed text stays as literal cell content. Locks in
  // the "no nested tables from live typing" promise.
  //
  // Before — pre-seeded 1x1 table; caret in (cleared) body cell:
  //   | h |        ← header
  //   |   |        ← caret here (body cell, cleared)
  //
  // After typing `| x | ` INSIDE the body cell — text stays literal, NO
  // nested table:
  //   | h |
  //   | | x |  |   ← body cell holds literal text "| x | "
  test("typing `| x | ` (space-commit shape) INSIDE an existing cell does NOT build a nested table", async () => {
    const { editor, screen, user } = await renderTestEditor({
      plugins: (
        <>
          <TablePlugin hasHorizontalScroll />
          <TableKeyboardPlugin />
          <MarkdownShortcutPlugin transformers={MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS} />
        </>
      ),
      // Pre-seed a 1-cell-body table via the import path; the cell guard is
      // intentionally NOT relevant for the OUTER import (the row line lives
      // at root, not in a cell), so we get a clean table to type into.
      initialValue: ["| h |", "| --- |", "| body |"].join("\n"),
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    // Move the caret into the body cell and clear its content so we can
    // type a clean pipe-row into an effectively-empty cell.
    editor.update(
      () => {
        const root = $getRoot();
        const table = root.getFirstChild();
        if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
        const bodyCell = getCell(table, 1, 0);
        bodyCell.clear();
        bodyCell.selectStart();
      },
      { discrete: true },
    );

    // Type a pipe-row with trailing space (the form that would fire
    // $seedHeaderColumn at root). It must NOT fire here, because the
    // grandparent of the typed paragraph is a cell, not the root.
    await user.keyboard("| x | ");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      // OUTER table shape stays at 1 header + 1 body row, 1 column each —
      // the shortcut didn't fire, so no new columns / rows were added.
      expect(table.getChildrenSize()).toBe(2);

      const bodyCell = getCell(table, 1, 0);
      // No nested TableNode inside the body cell — the typed text stays
      // as literal cell content.
      const nestedTable = bodyCell.getChildren().find((c) => $isTableNode(c));
      expect(nestedTable).toBeUndefined();
      // The typed pipe row is the literal cell text (a leading typed space
      // may be collapsed by the browser inside an empty contenteditable —
      // assert the meaningful tail of the input survived).
      expect(bodyCell.getTextContent()).toContain("| x");
    });
  });
});
