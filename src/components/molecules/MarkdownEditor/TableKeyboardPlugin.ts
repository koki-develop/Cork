import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $deleteTableColumnAtSelection,
  $insertTableColumnAtSelection,
  $insertTableRowAtSelection,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  type TableCellNode,
  type TableNode,
  type TableRowNode,
} from "@lexical/table";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  DELETE_LINE_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_TAB_COMMAND,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { type ReactNode, useEffect } from "react";

import {
  $cellFromSelection,
  $hasBodyRow,
  $hasLineAboveInCell,
  $hasLineBelowInCell,
  $isCaretAtCellEnd,
  $isCaretAtCellStart,
  $isCaretOnFirstLineOf,
  $isCellEmpty,
  $isColumnEmpty,
  $isHeaderRow,
  $isRowEmpty,
  $rowOf,
  $tableOf,
} from "./tableHelpers";

// Keyboard-driven table editing — the table grows and shrinks under the keys
// rather than via a toolbar:
//
//   - Tab on the rightmost cell adds a column to the right and moves into it
//     (every other Tab is left to TablePlugin's cell navigation).
//   - Enter adds a row below the current one and moves into it; Shift+Enter
//     inserts a line break inside the cell instead. On a trailing empty
//     (non-header) row Enter exits the table downward, dropping that row.
//   - ArrowDown/ArrowUp on the last/first row of a table that is the document's
//     last/first block escapes into a fresh paragraph below/above it (mirrors
//     CodeBlockEscapePlugin — a table at the document edge would otherwise trap
//     the caret).
//   - Backspace in an empty cell: deletes the column first when the whole
//     column is empty; otherwise jumps to the end of the cell on its left; in
//     the empty leftmost cell of an empty row it deletes that row (removing the
//     whole table when it was the last row). Header rows are never deleted.
//   - Cmd/Ctrl+Backspace (DELETE_LINE) works inside cells — TablePlugin swallows
//     it ("TODO: Fix Delete Line in Table Cells"), so we reimplement the
//     delete-to-line-start without its cell-escaping fallback.
//
// Structural handlers run at CRITICAL so they win over TablePlugin's built-in
// Tab / delete / arrow handlers (registered at HIGH), and each returns false the
// moment the caret isn't in the situation it owns, leaving normal editing alone.
export function TableKeyboardPlugin(): ReactNode {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let scrollRaf = 0;
    const unregister = mergeRegister(
      editor.registerCommand<KeyboardEvent>(
        KEY_TAB_COMMAND,
        (event) => {
          if (event.shiftKey) {
            return false;
          }
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return false;
          }
          const cell = $cellFromSelection();
          if (cell == null) {
            return false;
          }
          // A cell to the right exists → let the built-in handler navigate to it.
          if ($isTableCellNode(cell.getNextSibling())) {
            return false;
          }
          // Rightmost cell: grow the table by a column and step into the new one.
          event.preventDefault();
          $insertTableColumnAtSelection(true);
          const newCell = cell.getNextSibling();
          if ($isTableCellNode(newCell)) {
            newCell.selectStart();
          }
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand<KeyboardEvent | null>(
        KEY_ENTER_COMMAND,
        (event) => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return false;
          }
          const cell = $cellFromSelection();
          if (cell == null) {
            return false;
          }
          event?.preventDefault();
          // Shift+Enter is the in-cell newline; plain Enter grows the table.
          if (event?.shiftKey) {
            selection.insertLineBreak();
            return true;
          }
          // Replace any ranged selection first so plain Enter stays uniformly
          // "add a row" (Tab/Backspace guard on a collapsed caret; Enter handles
          // the selection instead of acting around it).
          if (!selection.isCollapsed()) {
            selection.removeText();
          }
          const row = $rowOf(cell);
          const table = $tableOf(cell);
          // Enter on a trailing empty (non-header) row exits below the table,
          // dropping that row — so Enter doesn't just stack empty rows.
          if (
            row != null &&
            table != null &&
            row.is(table.getLastChild()) &&
            $isRowEmpty(row) &&
            !$isHeaderRow(row)
          ) {
            const paragraph = $createParagraphNode();
            table.insertAfter(paragraph);
            // Removing the only row would leave an empty table — drop it whole.
            if (table.getChildrenSize() <= 1) {
              table.remove();
            } else {
              row.remove();
            }
            paragraph.select();
            return true;
          }
          const columnIndex = cell.getIndexWithinParent();
          const newRow = $insertTableRowAtSelection(true);
          if (newRow != null) {
            const target = newRow.getChildAtIndex(columnIndex) ?? newRow.getFirstChild();
            if ($isTableCellNode(target)) {
              target.selectStart();
            }
          }
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_DOWN_COMMAND,
        (event) => $handleVerticalArrow(event, "down"),
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_UP_COMMAND,
        (event) => $handleVerticalArrow(event, "up"),
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_RIGHT_COMMAND,
        (event) => $handleHorizontalArrow(event, "right"),
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_LEFT_COMMAND,
        (event) => $handleHorizontalArrow(event, "left"),
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand<boolean>(
        DELETE_LINE_COMMAND,
        (isBackward) => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || $cellFromSelection() == null) {
            return false;
          }
          // Extend to the line boundary and remove that span. Unlike
          // RangeSelection.deleteLine we deliberately omit the deleteCharacter
          // fallback: when nothing precedes the caret on the line it would merge
          // the cell into its neighbour, which is exactly why the built-in punts.
          selection.modify("extend", isBackward, "lineboundary");
          if (!selection.isCollapsed()) {
            selection.removeText();
          }
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return false;
          }
          const cell = $cellFromSelection();
          // Only an empty cell triggers structural backspace; anything else is a
          // normal character delete handled downstream.
          if (cell == null || !$isCellEmpty(cell)) {
            return false;
          }
          const row = $rowOf(cell);
          const table = $tableOf(cell);

          // An empty column collapses first — wherever the caret sits in it.
          // (Guarded so the table's last column never goes this way; that case
          // falls through to the empty-row / whole-table deletion below.)
          if (row != null && table != null && row.getChildrenSize() > 1) {
            if ($isColumnEmpty(table, cell.getIndexWithinParent())) {
              event.preventDefault();
              $deleteColumn(cell);
              return true;
            }
          }

          // Not the leftmost cell → hop to the end of the cell on the left.
          const left = cell.getPreviousSibling();
          if ($isTableCellNode(left)) {
            event.preventDefault();
            left.selectEnd();
            return true;
          }

          // Leftmost cell of an empty row → delete the row. A header row is
          // protected (dropping it is irreversible) — unless there are no body
          // rows left, in which case deleting it removes the now-pointless table.
          if (row == null || table == null || !$isRowEmpty(row)) {
            return false;
          }
          if ($isHeaderRow(row) && $hasBodyRow(table)) {
            return false;
          }
          event.preventDefault();
          $deleteRow(table, row);
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      // Keep the caret's cell horizontally in view: a wide table scrolls inside
      // its wrapper, but moving the caret (Tab into a new column, arrows, typing
      // at the edge) doesn't auto-scroll it, so the caret can drift off-screen.
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          const cell = $cellFromSelection();
          if (cell != null) {
            const cellKey = cell.getKey();
            // Coalesce bursts (typing, held arrows) into one scroll per frame,
            // deferred so a freshly inserted column/row is laid out before we
            // measure it.
            cancelAnimationFrame(scrollRaf);
            scrollRaf = requestAnimationFrame(() => scrollCellIntoView(editor, cellKey));
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
    return () => {
      cancelAnimationFrame(scrollRaf);
      unregister();
    };
  }, [editor]);

  return null;
}

// Horizontally scrolls a cell's table wrapper so the cell is fully visible.
// Adjusts only `scrollLeft` (never vertical / page scroll), and no-ops when the
// table isn't actually overflowing. Runs outside the editor update — pure DOM.
function scrollCellIntoView(editor: LexicalEditor, cellKey: string): void {
  const cellElement = editor.getElementByKey(cellKey);
  const wrapper = cellElement?.closest("table")?.parentElement;
  if (cellElement == null || wrapper == null || wrapper.scrollWidth <= wrapper.clientWidth) {
    return;
  }
  const MARGIN = 8;
  const wrapperRect = wrapper.getBoundingClientRect();
  const cellRect = cellElement.getBoundingClientRect();
  if (cellRect.right > wrapperRect.right) {
    wrapper.scrollLeft += cellRect.right - wrapperRect.right + MARGIN;
  } else if (cellRect.left < wrapperRect.left) {
    wrapper.scrollLeft -= wrapperRect.left - cellRect.left + MARGIN;
  }
}

// Shift/Alt extend or word-jump a selection and Cmd/Ctrl jump by line/document;
// none of those should be reinterpreted as table navigation.
function hasNavModifier(event: KeyboardEvent): boolean {
  return event.shiftKey || event.altKey || event.metaKey || event.ctrlKey;
}

// ArrowUp/ArrowDown around a table:
//   - From a block right below the table, ArrowUp enters the last row's *first*
//     cell (not whichever cell the native caret-x lands on, which jumps to the
//     right edge).
//   - Inside a table, on an interior line of a multi-line cell, keep the caret
//     in the cell: return true WITHOUT preventDefault so the browser performs
//     the native within-cell line move, which only blocks TablePlugin's built-in
//     handler (whose rect heuristic wrongly jumps to the previous row from the
//     empty line after an in-cell line break).
//   - On the cell's edge line, escape into a fresh paragraph when the table
//     sits at the document's start/end; otherwise return false so the built-in
//     moves to the adjacent row.
function $handleVerticalArrow(event: KeyboardEvent, direction: "up" | "down"): boolean {
  if (hasNavModifier(event)) {
    return false;
  }
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }
  const cell = $cellFromSelection();
  if (cell == null) {
    return direction === "up" ? $enterTableFromBelow(event) : false;
  }

  if (direction === "up" ? $hasLineAboveInCell(cell) : $hasLineBelowInCell(cell)) {
    return true;
  }

  const table = $tableOf(cell);
  const row = $rowOf(cell);
  if (table == null || row == null) {
    return false;
  }
  const atDocEdge =
    direction === "up"
      ? table.getPreviousSibling() == null && row.is(table.getFirstChild())
      : table.getNextSibling() == null && row.is(table.getLastChild());
  if (!atDocEdge) {
    return false;
  }

  event.preventDefault();
  const paragraph = $createParagraphNode();
  if (direction === "up") {
    table.insertBefore(paragraph);
  } else {
    table.insertAfter(paragraph);
  }
  paragraph.select();
  return true;
}

// ArrowUp from the block directly below a table (on that block's first line)
// enters the table at the last row's first cell, so the caret doesn't jump to
// the right edge wherever native caret-x happens to land. Returns false in every
// other case so normal upward navigation is untouched.
function $enterTableFromBelow(event: KeyboardEvent): boolean {
  const block = $topLevelBlock();
  if (block == null || !$isCaretOnFirstLineOf(block)) {
    return false;
  }
  const table = block.getPreviousSibling();
  if (!$isTableNode(table)) {
    return false;
  }
  const lastRow = table.getLastChild();
  if (!$isTableRowNode(lastRow)) {
    return false;
  }
  const firstCell = lastRow.getFirstChild();
  if (!$isTableCellNode(firstCell)) {
    return false;
  }
  event.preventDefault();
  firstCell.selectStart();
  return true;
}

// The top-level block (direct child of the root) that contains the caret.
function $topLevelBlock(): ElementNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return null;
  }
  let node: LexicalNode | null = selection.anchor.getNode();
  while (node != null && !$isRootOrShadowRoot(node.getParent())) {
    node = node.getParent();
  }
  return $isElementNode(node) ? node : null;
}

// ArrowRight/ArrowLeft never leave the table: when the caret is at the end of a
// row's last cell (right) or the start of its first cell (left), swallow the key
// so it holds — no wrapping into the adjacent row and no escaping the table (use
// ArrowUp/ArrowDown or a click to leave). Every other case returns false, so the
// built-in still navigates within a cell and between cells of the same row.
function $handleHorizontalArrow(event: KeyboardEvent, direction: "left" | "right"): boolean {
  if (hasNavModifier(event)) {
    return false;
  }
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }
  const cell = $cellFromSelection();
  if (cell == null) {
    return false;
  }

  const atRowEdge =
    direction === "right"
      ? cell.getNextSibling() == null && $isCaretAtCellEnd(cell)
      : cell.getPreviousSibling() == null && $isCaretAtCellStart(cell);
  if (atRowEdge) {
    event.preventDefault();
    return true;
  }
  return false;
}

// Removes the column the cell sits in, dropping the caret into the cell to its
// left (end) when there is one, otherwise the cell that slides into its place on
// the right (start). Sibling refs are captured first since they survive the
// delete (they live in other columns) while `cell` itself is removed.
function $deleteColumn(cell: TableCellNode): void {
  const left = cell.getPreviousSibling();
  const right = cell.getNextSibling();
  $deleteTableColumnAtSelection();
  if ($isTableCellNode(left)) {
    left.selectEnd();
  } else if ($isTableCellNode(right)) {
    right.selectStart();
  }
}

// Removes `row`, dropping the caret into an adjacent row — the end of the row
// above when there is one (matching backspace's leftward motion), otherwise the
// start of the row below. If it was the table's only row, the whole table goes.
function $deleteRow(table: TableNode, row: TableRowNode): void {
  const prevRow = row.getPreviousSibling();
  const nextRow = row.getNextSibling();

  if (!$isTableRowNode(prevRow) && !$isTableRowNode(nextRow)) {
    $removeTable(table);
    return;
  }

  row.remove();

  if ($isTableRowNode(prevRow)) {
    const cell = prevRow.getFirstChild();
    if ($isTableCellNode(cell)) {
      cell.selectEnd();
    }
  } else if ($isTableRowNode(nextRow)) {
    const cell = nextRow.getFirstChild();
    if ($isTableCellNode(cell)) {
      cell.selectStart();
    }
  }
}

// Removes the table and parks the caret in a neighbouring block, creating an
// empty paragraph if the table was the document's only content.
function $removeTable(table: TableNode): void {
  const prev = table.getPreviousSibling();
  const next = table.getNextSibling();
  table.remove();

  if ($isElementNode(prev)) {
    prev.selectEnd();
  } else if ($isElementNode(next)) {
    next.selectStart();
  } else {
    const paragraph = $createParagraphNode();
    $getRoot().append(paragraph);
    paragraph.select();
  }
}
