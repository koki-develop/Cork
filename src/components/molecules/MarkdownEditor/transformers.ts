import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  type ElementTransformer,
  TRANSFORMERS,
  type Transformer,
} from "@lexical/markdown";
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $getTableCellNodeFromLexicalNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
} from "@lexical/table";
import { $isParagraphNode, $isTextNode, type LexicalNode } from "lexical";

// `@lexical/markdown`'s default TRANSFORMERS have no table support, so we add a
// GFM-table transformer (adapted from the Lexical playground). It round-trips a
// `TableNode` to / from pipe-delimited Markdown so tables survive a save/load
// cycle and can be authored by typing the pipe syntax.
const TABLE_ROW_REG_EXP = /^(?:\|)(.+)(?:\|)\s?$/;
// Each column needs at least one dash (`-+`, not `-*`): with `-*` a blank row
// like `|  |` matches as a divider, so reloading a table with a trailing empty
// row would wrongly promote the row above it to a header.
const TABLE_ROW_DIVIDER_REG_EXP = /^(\| ?:?-+:? ?)+\|\s?$/;

const TABLE: ElementTransformer = {
  dependencies: [TableNode, TableRowNode, TableCellNode],
  export: (node: LexicalNode) => {
    if (!$isTableNode(node)) {
      return null;
    }

    const output: string[] = [];

    let isFirstRow = true;
    for (const row of node.getChildren()) {
      if (!$isTableRowNode(row)) {
        continue;
      }

      const rowOutput = row
        .getChildren()
        .filter($isTableCellNode)
        .map((cell) => encodeCell($convertToMarkdownString(MARKDOWN_TRANSFORMERS, cell)));

      output.push(`| ${rowOutput.join(" | ")} |`);
      // GFM fixes the delimiter row at line 2 and requires every table to have a
      // header, so emit it after the first row unconditionally rather than per
      // `__headerState`. The editor only ever authors first-row headers (and
      // import promotes the first row), so this matches the real shape while
      // staying valid GFM even if internal header state ever drifted.
      if (isFirstRow) {
        output.push(`| ${rowOutput.map(() => "---").join(" | ")} |`);
        isFirstRow = false;
      }
    }

    return output.join("\n");
  },
  regExp: TABLE_ROW_REG_EXP,
  replace: (parentNode, children, match, isImport) => {
    // Never build a table inside a table cell — no nested tables. A cell whose
    // text happens to look like a pipe row (typed live, or restored from a cell
    // body on import via $createTableCell) must stay literal text.
    if ($getTableCellNodeFromLexicalNode(parentNode) != null) {
      // On import, $importBlocks has already sliced the matched text off the
      // line's text node *before* calling us (it doesn't roll that back when we
      // cancel), so restore it — otherwise a cell body like `| x |` would
      // reload as empty. (Live typing splits the node non-destructively, so the
      // text survives there without help.)
      const textNode = children[0];
      if (isImport && $isTextNode(textNode)) {
        textNode.setTextContent(match[0] + textNode.getTextContent());
      }
      return false;
    }

    // A divider row (`| --- | --- |`) just promotes the preceding row's cells
    // to header cells, then deletes itself.
    if (TABLE_ROW_DIVIDER_REG_EXP.test(match[0])) {
      const table = parentNode.getPreviousSibling();
      if (!table || !$isTableNode(table)) {
        return;
      }

      const rows = table.getChildren();
      const lastRow = rows[rows.length - 1];
      if (!lastRow || !$isTableRowNode(lastRow)) {
        return;
      }

      lastRow.getChildren().forEach((cell) => {
        if (!$isTableCellNode(cell)) {
          return;
        }
        cell.setHeaderStyles(TableCellHeaderStates.ROW, TableCellHeaderStates.ROW);
      });

      parentNode.remove();
      return;
    }

    const matchCells = mapToTableCells(match[0]);

    if (matchCells == null) {
      return;
    }

    // Walk back over preceding single-line paragraphs that also look like table
    // rows so a freshly typed/pasted block of pipe rows collapses into one table.
    const rows = [matchCells];
    let sibling = parentNode.getPreviousSibling();
    let maxCells = matchCells.length;

    while (sibling) {
      if (!$isParagraphNode(sibling)) {
        break;
      }

      if (sibling.getChildrenSize() !== 1) {
        break;
      }

      const firstChild = sibling.getFirstChild();

      if (!$isTextNode(firstChild)) {
        break;
      }

      const cells = mapToTableCells(firstChild.getTextContent());

      if (cells == null) {
        break;
      }

      maxCells = Math.max(maxCells, cells.length);
      rows.unshift(cells);
      const previousSibling = sibling.getPreviousSibling();
      sibling.remove();
      sibling = previousSibling;
    }

    const table = $createTableNode();

    for (const cells of rows) {
      const tableRow = $createTableRowNode();
      table.append(tableRow);

      for (let i = 0; i < maxCells; i++) {
        tableRow.append(i < cells.length ? cells[i] : $createTableCell(""));
      }
    }

    // Merge into an adjacent table with the same column count, so the divider
    // row's header promotion lands on the original cells.
    const previousSibling = parentNode.getPreviousSibling();
    if ($isTableNode(previousSibling) && getTableColumnsSize(previousSibling) === maxCells) {
      previousSibling.append(...table.getChildren());
      parentNode.remove();
      // Children moved out of `table`; select the table they landed in.
      previousSibling.selectEnd();
      return;
    }

    parentNode.replace(table);

    // Importing GFM keeps the source's literal shape — a bare row stays a
    // header-less single row until the source's divider line promotes it, and
    // the body rows arrive as their own lines. But when the user *types* a row
    // live there is no divider / body to follow, so a raw single row is useless.
    // The trigger key decides how to make it usable: a trailing space (the row
    // was committed with Space) keeps building the header — it adds an empty
    // header column and parks the caret there; otherwise the row was committed
    // with Enter, so we drop in an empty body row and move into it.
    if (!isImport) {
      if (/\s$/.test(match[0])) {
        $seedHeaderColumn(table);
      } else {
        $seedBodyRow(table);
      }
      return;
    }

    table.selectEnd();
  },
  triggerOnEnter: true,
  type: "element",
};

// Promotes the first row to a header (no-op-safe if malformed). Returns the
// header row so callers can extend it / add a body.
function $promoteHeader(table: TableNode): TableRowNode | null {
  const headerRow = table.getFirstChild();
  if (!$isTableRowNode(headerRow)) {
    table.selectEnd();
    return null;
  }
  for (const cell of headerRow.getChildren()) {
    if ($isTableCellNode(cell)) {
      cell.setHeaderStyles(TableCellHeaderStates.ROW, TableCellHeaderStates.ROW);
    }
  }
  return headerRow;
}

// Space commit: append an empty header column and move into it, so the user can
// keep naming columns. No body row is added.
function $seedHeaderColumn(table: TableNode): void {
  const headerRow = $promoteHeader(table);
  if (headerRow == null) {
    return;
  }
  const newHeader = $createTableCellNode(TableCellHeaderStates.ROW);
  headerRow.append(newHeader);
  newHeader.selectStart();
}

// Enter commit: guarantee an empty body row and drop the caret into its first
// cell, so the table is ready to fill.
function $seedBodyRow(table: TableNode): void {
  const headerRow = $promoteHeader(table);
  if (headerRow == null) {
    return;
  }

  const existingBody = headerRow.getNextSibling();
  let bodyRow: TableRowNode;
  if ($isTableRowNode(existingBody)) {
    bodyRow = existingBody;
  } else {
    bodyRow = $createTableRowNode();
    for (let i = 0; i < headerRow.getChildrenSize(); i++) {
      bodyRow.append($createTableCell(""));
    }
    table.append(bodyRow);
  }

  const firstBodyCell = bodyRow.getFirstChild();
  if ($isTableCellNode(firstBodyCell)) {
    firstBodyCell.selectStart();
  } else {
    table.selectEnd();
  }
}

function getTableColumnsSize(table: TableNode) {
  const row = table.getFirstChild();
  return $isTableRowNode(row) ? row.getChildrenSize() : 0;
}

function $createTableCell(textContent: string): TableCellNode {
  const cell = $createTableCellNode(TableCellHeaderStates.NO_STATUS);
  // GFM pads cells with spaces (`| aaa |`); trim removes that padding, then
  // decodeCell restores any escaped `\`, `|` or newline.
  $convertFromMarkdownString(decodeCell(textContent.trim()), MARKDOWN_TRANSFORMERS, cell);
  return cell;
}

function mapToTableCells(textContent: string): Array<TableCellNode> | null {
  const match = textContent.match(TABLE_ROW_REG_EXP);
  if (!match || !match[1]) {
    return null;
  }
  // Split only on *unescaped* pipes — an escaped `\|` is literal cell content,
  // not a column boundary (delimiters are always space-padded by the join, so
  // they're never preceded by a backslash).
  return match[1].split(/(?<!\\)\|/).map((text) => $createTableCell(text));
}

// A cell body lives on one pipe-delimited line, so `\`, `|` and newlines in it
// must be escaped or they'd be read as a column / row boundary. Escape order:
// backslash first, so the markers added for `|` / newline aren't doubled. The
// trailing trim mirrors GFM's space padding (kept as `\n` if it was a newline).
function encodeCell(markdown: string): string {
  return markdown.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, "\\n").trim();
}

// Inverse of encodeCell: a backslash escape maps `\n` → newline and `\x` → `x`
// (covers `\\` → `\` and `\|` → `|`). Single left-to-right pass, so doubled
// backslashes decode correctly.
function decodeCell(text: string): string {
  return text.replace(/\\(.)/g, (_, ch) => (ch === "n" ? "\n" : ch));
}

// TABLE leads so its row regExp wins before the default element transformers
// (e.g. a leading-pipe line is a table row, not a quote). The TABLE transformer
// recurses into this list for cell bodies, so it must be defined here.
export const MARKDOWN_TRANSFORMERS: Array<Transformer> = [TABLE, ...TRANSFORMERS];
