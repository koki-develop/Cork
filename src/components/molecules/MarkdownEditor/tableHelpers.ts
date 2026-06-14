import {
  $getTableCellNodeFromLexicalNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  type TableCellNode,
  type TableNode,
  type TableRowNode,
} from "@lexical/table";
import {
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  type ElementNode,
  type LexicalNode,
} from "lexical";

// Selection / structure helpers shared by the table keyboard handlers. Each
// `$`-prefixed function must run inside an `editor.read()` / `editor.update()`.

// The table cell holding a collapsed caret, or null when the caret isn't inside
// a cell. The keyboard model only ever acts on a collapsed selection, so a
// RangeSelection is all we handle.
export function $cellFromSelection(): TableCellNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return null;
  }
  const node = selection.anchor.getNode();
  return $isTableCellNode(node) ? node : $getTableCellNodeFromLexicalNode(node);
}

export function $tableOf(cell: TableCellNode): TableNode | null {
  const table = cell.getParent()?.getParent();
  return $isTableNode(table) ? table : null;
}

export function $rowOf(cell: TableCellNode): TableRowNode | null {
  const row = cell.getParent();
  return $isTableRowNode(row) ? row : null;
}

export function $isCellEmpty(cell: TableCellNode): boolean {
  return cell.getTextContent().length === 0;
}

export function $isRowEmpty(row: TableRowNode): boolean {
  return row.getChildren().every((cell) => $isTableCellNode(cell) && $isCellEmpty(cell));
}

// A header row carries header state on its cells (set when the table is seeded).
// Header rows are protected from row deletion — dropping one is irreversible —
// except once the table has no body rows left (see `$hasBodyRow`), so the table
// can still be deleted entirely.
export function $isHeaderRow(row: TableRowNode): boolean {
  const first = row.getFirstChild();
  return $isTableCellNode(first) && first.hasHeader();
}

export function $hasBodyRow(table: TableNode): boolean {
  return table.getChildren().some((row) => $isTableRowNode(row) && !$isHeaderRow(row));
}

// Whether the collapsed caret sits at the very start / end of the cell's content
// — used to stop a horizontal arrow at a row edge rather than wrapping into the
// adjacent row. True when the anchor is at the start/end of its own node AND no
// sibling lies beyond it on the way up to the cell.
export function $isCaretAtCellStart(cell: TableCellNode): boolean {
  return $isCaretAtCellEdge(cell, "start");
}

export function $isCaretAtCellEnd(cell: TableCellNode): boolean {
  return $isCaretAtCellEdge(cell, "end");
}

function $isCaretAtCellEdge(cell: TableCellNode, edge: "start" | "end"): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }
  const anchor = selection.anchor;
  const node = anchor.getNode();

  if (edge === "start") {
    if (anchor.offset !== 0) {
      return false;
    }
  } else {
    const size = $isTextNode(node)
      ? node.getTextContentSize()
      : $isElementNode(node)
        ? node.getChildrenSize()
        : 0;
    if (anchor.offset !== size) {
      return false;
    }
  }

  let current: LexicalNode = node;
  while (!cell.is(current)) {
    const sibling = edge === "start" ? current.getPreviousSibling() : current.getNextSibling();
    if (sibling != null) {
      return false;
    }
    const parent: LexicalNode | null = current.getParent();
    if (parent == null) {
      return false;
    }
    current = parent;
  }
  return true;
}

// Whether the caret has another line above / below it *within the same cell* —
// i.e. it isn't on the cell's first / last line. Used to keep ArrowUp/ArrowDown
// moving inside a multi-line cell instead of letting the built-in table handler
// jump rows. Deliberately structural (line breaks / block boundaries), not
// rect-based: the built-in's rect heuristic mis-fires on the empty line right
// after an in-cell line break, which is the bug this replaces.
export function $hasLineAboveInCell(cell: TableCellNode): boolean {
  const block = $cellTopBlock(cell);
  if (block == null) {
    return false;
  }
  if (!block.is(cell.getFirstChild())) {
    return true; // a block sits above this one inside the cell
  }
  return $textBeforeCaretInBlock(block).includes("\n");
}

export function $hasLineBelowInCell(cell: TableCellNode): boolean {
  const block = $cellTopBlock(cell);
  if (block == null) {
    return false;
  }
  if (!block.is(cell.getLastChild())) {
    return true; // a block sits below this one inside the cell
  }
  const before = $textBeforeCaretInBlock(block);
  return block.getTextContent().slice(before.length).includes("\n");
}

// Whether the caret is on the first visual line of `block` (no line break before
// it). Used to tell whether ArrowUp would actually leave the block — e.g. a
// paragraph sitting right below a table — rather than just move up a line.
export function $isCaretOnFirstLineOf(block: ElementNode): boolean {
  return !$textBeforeCaretInBlock(block).includes("\n");
}

// The cell's direct child (a paragraph) that contains the caret.
function $cellTopBlock(cell: TableCellNode): LexicalNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return null;
  }
  const anchorNode = selection.anchor.getNode();
  if (cell.is(anchorNode)) {
    return cell.getChildAtIndex(selection.anchor.offset) ?? cell.getLastChild();
  }
  let node: LexicalNode | null = anchorNode;
  while (node != null && !cell.is(node.getParent())) {
    node = node.getParent();
  }
  return node;
}

// The text content of `block` up to the caret, built the *same way*
// `getTextContent` builds the full string — including the `\n\n` it inserts
// between non-inline block children. Slicing the full text at `before.length`
// therefore lines up exactly, so the `.includes("\n")` line-edge checks above
// stay correct even when a cell holds nested blocks (e.g. a list), where a plain
// `getTextContentSize` offset would under-count by the separators.
function $textBeforeCaretInBlock(block: LexicalNode): string {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return "";
  }
  const anchorNode = selection.anchor.getNode();
  const anchorOffset = selection.anchor.offset;
  let before = "";
  let done = false;

  // `getTextContent` appends `\n\n` after a non-inline element child unless it's
  // the last child; mirror that exactly so offsets match.
  const separatorAfter = (parent: ElementNode, index: number): string => {
    const child = parent.getChildren()[index];
    return $isElementNode(child) && index !== parent.getChildrenSize() - 1 && !child.isInline()
      ? "\n\n"
      : "";
  };

  const walk = (node: LexicalNode) => {
    if (done) {
      return;
    }
    if (node.is(anchorNode)) {
      if ($isElementNode(node)) {
        for (let i = 0; i < anchorOffset && i < node.getChildrenSize(); i++) {
          before += node.getChildren()[i].getTextContent() + separatorAfter(node, i);
        }
      } else {
        before += node.getTextContent().slice(0, anchorOffset);
      }
      done = true;
      return;
    }
    if ($isElementNode(node)) {
      const children = node.getChildren();
      for (let i = 0; i < children.length; i++) {
        walk(children[i]);
        if (done) {
          return; // caret is inside this child; its trailing separator is "after"
        }
        before += separatorAfter(node, i);
      }
    } else {
      before += node.getTextContent();
    }
  };

  walk(block);
  return before;
}

// Whether every cell in the given column (including the header row) is empty.
// Assumes a simple grid — cells line up by index — which holds here since the
// editor never merges cells.
export function $isColumnEmpty(table: TableNode, columnIndex: number): boolean {
  return table.getChildren().every((row) => {
    if (!$isTableRowNode(row)) {
      return true;
    }
    const cell = row.getChildAtIndex(columnIndex);
    return !$isTableCellNode(cell) || $isCellEmpty(cell);
  });
}
