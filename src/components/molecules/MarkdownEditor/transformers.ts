import { $createCodeNode, $isCodeNode } from "@lexical/code";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  CHECK_LIST,
  CODE as DEFAULT_CODE,
  type ElementTransformer,
  type MultilineElementTransformer,
  ORDERED_LIST,
  QUOTE as DEFAULT_QUOTE,
  type TextFormatTransformer,
  TRANSFORMERS,
  type Transformer,
  UNORDERED_LIST,
} from "@lexical/markdown";
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from "@lexical/react/LexicalHorizontalRuleNode";
import { $createQuoteNode, $isQuoteNode, QuoteNode } from "@lexical/rich-text";
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
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getState,
  $isElementNode,
  $isLineBreakNode,
  $isParagraphNode,
  $isTextNode,
  $setState,
  createState,
  type ElementNode,
  type LexicalNode,
  ParagraphNode,
} from "lexical";

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
      // Only park the caret for a live-typed row (the user is actively
      // building the table). On import this would set a real selection out
      // of nowhere on every task-open with a table — nothing downstream
      // expects a selection to exist yet (see the `!isImport` branch below),
      // and `CodeBlockHighlightPlugin`'s `$updateAndRetainSelection` reads
      // whatever selection is current without checking it actually belongs
      // to the code block it's re-tokenizing, so a stray selection here gets
      // silently teleported into a same-tick code block's first token.
      if (!isImport) {
        previousSibling.selectEnd();
      }
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

    // Import is a quiet "load the document as-is" — no caret should be
    // conjured for a table that just arrived from disk (see the `!isImport`
    // guard above for why this used to run unconditionally).
  },
  triggerOnEnter: true,
  type: "element",
};

// `@lexical/markdown`'s defaults have no thematic-break ("horizontal rule")
// support, so we add one backed by Lexical's built-in HorizontalRuleNode (an
// <hr> decorator node; styled via MarkdownEditor's `hr` theme class and driven
// by HorizontalRulePlugin). Import accepts all three CommonMark markers (`---`,
// `***`, `___`, 3+ chars); export always writes `---`, so a loaded `---`
// round-trips unchanged and authored rules stay canonical. Only the non-spaced
// forms match — a spaced `- - -` would collide with an unordered-list item.
const HORIZONTAL_RULE_REG_EXP = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;

const HORIZONTAL_RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node: LexicalNode) => ($isHorizontalRuleNode(node) ? "---" : null),
  regExp: HORIZONTAL_RULE_REG_EXP,
  replace: (parentNode, children, match, isImport) => {
    // Never build a rule inside a table cell — a cell body that is exactly
    // `---`/`***`/`___` must stay literal text, not become an <hr> nested in the
    // cell. Cell bodies recurse through MARKDOWN_TRANSFORMERS (via
    // $createTableCell), so without this guard they'd match here. Mirrors the
    // TABLE transformer's own cell guard.
    if ($getTableCellNodeFromLexicalNode(parentNode) != null) {
      // On import, $importBlocks has already sliced the matched marker off the
      // line's text node before calling us and doesn't roll that back on a
      // cancel, so restore it — otherwise a cell body of `---` would reload
      // empty. (Live typing splits the node non-destructively, so the text
      // survives there without help.)
      const textNode = children[0];
      if (isImport && $isTextNode(textNode)) {
        textNode.setTextContent(match[0] + textNode.getTextContent());
      }
      return false;
    }

    const rule = $createHorizontalRuleNode();
    // On import (or anywhere mid-document) replace the matched line outright.
    // When typed live as the document's last block, insert the rule *above* the
    // paragraph instead so the caret keeps a trailing line to continue in
    // (mirrors Lexical's playground HR transformer).
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(rule);
    } else {
      parentNode.insertBefore(rule);
    }
    // Only park the caret for a live-typed rule — import is a quiet "load the
    // document as-is" and must not conjure a selection out of nowhere (same
    // reasoning as the TABLE transformer's `!isImport` guards above).
    if (!isImport) {
      rule.selectNext();
    }
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

// Wrap each list transformer so it bails (returns false) when the matched
// paragraph sits inside a table cell. Lists in cells aren't supported (see
// NoListInTablePlugin and the Tables section in AGENTS.md) and unwrapping a
// freshly-built ListNode after the fact would erase the typed `- ` / `1. `
// marker — there's no text on a brand-new empty bullet to preserve. Mirrors
// the TABLE / HORIZONTAL_RULE cell guards: on import, also restore the
// matched marker onto the line's text node (`$importBlocks` slices it off
// before calling us and doesn't roll back when we cancel), so a cell body
// of literally `- a` reloads as `- a` text instead of empty.
function cellAware(transformer: ElementTransformer): ElementTransformer {
  return {
    ...transformer,
    replace: (parentNode, children, match, isImport) => {
      if ($getTableCellNodeFromLexicalNode(parentNode) != null) {
        const textNode = children[0];
        if (isImport && $isTextNode(textNode)) {
          textNode.setTextContent(match[0] + textNode.getTextContent());
        }
        return false;
      }
      return transformer.replace(parentNode, children, match, isImport);
    },
  };
}

// Nested-quote support. Upstream `@lexical/markdown` treats each leading `>` as
// one level but flattens everything into a single `QuoteNode` with inline
// children — `> foo\n> > bar` round-trips as a single quote whose text reads
// `foo\n> bar` (the second `>` left as literal text). To render true nesting
// we model each quote level as a `QuoteNode` and each quote line at that level
// as a `ParagraphNode` child; deeper levels are nested `QuoteNode` siblings of
// those paragraphs.
//
//   > foo
//   > > bar
//   > > > baz
//
// becomes
//
//   QuoteNode
//     ParagraphNode "foo"
//     QuoteNode
//       ParagraphNode "bar"
//       QuoteNode
//         ParagraphNode "baz"
//
// The `ParagraphNode` wrapper is the key load-bearing piece for live editing:
// `selection.insertParagraph()` (the default Enter handler) walks up to the
// nearest block ancestor (`INTERNAL_$isBlock`) and calls `insertNewAfter` on
// it. With inline content directly inside the QuoteNode, that ancestor is the
// QuoteNode itself and the default `QuoteNode.insertNewAfter` exits the
// block — the long-standing Cork bug where Enter dropped you out of a quote.
// With a wrapping ParagraphNode the ancestor is the paragraph instead, so
// Enter splits it and `ParagraphNode.insertNewAfter` appends a sibling
// paragraph INSIDE the QuoteNode — "stay in the quote" falls out of the
// default behavior, no command override required. `QuoteEnterPlugin` then
// handles only the exit case: empty trailing paragraph + Enter → outdent one
// level.
// One `>` followed by ` >` zero-or-more times, with EITHER a final whitespace
// separating the marker from the content OR end-of-line (a bare `>` / `> >` /
// `> > >` with no trailing content). The bare-marker branch is the CommonMark
// "empty blockquote line" — a `>` with nothing after it acts as a blank line
// inside the blockquote. Without that branch, `@lexical/markdown`'s import
// fallback (`MarkdownImport.ts` line 265: any non-matching line whose previous
// sibling is a Paragraph/Quote/List gets appended via softbreak + raw text)
// folds the bare `>` into the previous QuoteNode as `LineBreakNode + TextNode
// ">"`, which `$exportNestedQuote`'s defensive branches re-emit as TWO output
// lines (`> ` for the linebreak and `> >` for the text). Result: opening +
// saving a file with `> aaa\n>\n> bbb` rewrites it as `> aaa\n> \n> >\n> bbb`.
const QUOTE_REGEX = /^>(?:\s>)*(?:\s|$)/;
const QUOTE: ElementTransformer = {
  dependencies: [QuoteNode, ParagraphNode],
  export: (node, exportChildren) => {
    if (!$isQuoteNode(node)) {
      return null;
    }
    return $exportNestedQuote(node, exportChildren, 1).join("\n");
  },
  regExp: QUOTE_REGEX,
  replace: (parentNode, children, match, isImport) => {
    // `match[0]` is one of `> `, `> > `, ..., or the bare-marker form `>`,
    // `> >`, .... Depth equals the number of `>` chars in the prefix —
    // counting them works for both forms.
    const depth = (match[0].match(/>/g) ?? []).length;
    const paragraph = $createParagraphNode();
    paragraph.append(...children);

    // Merge into an immediately-adjacent QuoteNode at root level — whether
    // we got here from a streaming line-by-line import or from the live
    // typing shortcut firing at root. The import case is the obvious one
    // (consecutive `> ` lines), but the typing case matters too: after the
    // user exits a quote (Enter on empty trailing → fresh paragraph after
    // the QuoteNode) and types `> bbb` on that paragraph, they expect the
    // new line to join the previous quote (`> aaa\n> bbb`), not start a
    // second QuoteNode (`> aaa\n\n> bbb`). Same call site handles both.
    const previous = parentNode.getPreviousSibling();
    if ($isQuoteNode(previous)) {
      $mergeIntoQuoteTree(previous, paragraph, depth);
      parentNode.remove();
      // Bridge: a `> ` typed on a SPACER paragraph (between two QuoteNodes,
      // typically restored by `$insertSpacersBetweenAdjacentQuotes` from a
      // saved `> aaa\n\n> ccc`) should fold the trailing QuoteNode into
      // the same merged structure, not leave it dangling as a separate
      // block. Gated on `!isImport && depth === 1` because (a) the import
      // path's previous-merge already runs line-by-line so the spacer case
      // is only reachable via live typing, and (b) depth>1 live shortcut
      // never fires (anchor's grandparent has to be root for `> ` to
      // trigger, and that gate fails inside an existing QuoteNode).
      if (!isImport && depth === 1) {
        $absorbTrailingQuoteSibling(previous);
      }
      if (!isImport) {
        paragraph.select(0, 0);
      }
      return;
    }

    parentNode.replace($createNestedQuoteChain(depth, paragraph));
    if (!isImport && depth === 1) {
      // Same bridge as above for the case where the previous sibling
      // ISN'T a QuoteNode — typing `> bbb` between `hello\n|\n> ccc` still
      // wants `bbb` to fold the trailing `> ccc` into its new QuoteNode.
      const newRoot = paragraph.getParent();
      if ($isQuoteNode(newRoot)) {
        $absorbTrailingQuoteSibling(newRoot);
      }
    }
    if (!isImport) {
      paragraph.select(0, 0);
    }
  },
  triggerOnEnter: true,
  type: "element",
};

// If `quote`'s next sibling is also a QuoteNode at the same parent level,
// concatenate that sibling's children onto `quote` and drop the sibling.
// Two callers, both with the same shape problem (a freshly-created or
// freshly-merged QuoteNode left sitting next to an untouched same-level
// QuoteNode that would render as two separate blocks):
//
//   - QUOTE transformer's live-typing path: `> ` typed on a spacer paragraph
//     between two QuoteNodes — fuses both surrounding QuoteNodes into the
//     merged structure instead of leaving the trailing one dangling.
//   - QuoteNestingShortcutPlugin: `> ` typed inside an existing QuoteNode
//     where the original paragraph also had a QuoteNode AFTER it (the
//     mirror of the previous-is-quote merge), so the new nested chain
//     doesn't sit adjacent to an untouched trailing nested QuoteNode.
export function $absorbTrailingQuoteSibling(quote: QuoteNode): void {
  const next = quote.getNextSibling();
  if ($isQuoteNode(next)) {
    quote.append(...next.getChildren());
    next.remove();
  }
}

// Re-insert an empty paragraph between every pair of adjacent root-level
// QuoteNodes. `@lexical/markdown`'s import strips empty paragraphs after the
// line-by-line pass (the `isEmptyParagraph` cleanup loop in
// `createMarkdownImport`), so `> aaa\n\n> bbb` — which the line walker
// initially built as `[QuoteNode "aaa", emptyParagraph, QuoteNode "bbb"]` —
// collapses to `[QuoteNode "aaa", QuoteNode "bbb"]` on load. The two
// adjacent blockquotes then render flush against each other, while the live
// editor (where the user authored them with an Enter-exit + blank line +
// `> bbb`) had the empty paragraph in between as a visible gap. Run this
// after `$convertFromMarkdownString` to restore that gap so the on-screen
// shape after open matches the on-screen shape before save, edit by edit.
//
// Only fires at root level — adjacent nested QuoteNodes inside another
// QuoteNode never occur in our tree (consecutive same-depth quote lines
// merge into one QuoteNode with two paragraphs via `$mergeIntoQuoteTree`),
// and the `.cork-quote p { margin: 0 }` rule would zero any spacer
// margin we tried to insert there anyway.
export function $insertSpacersBetweenAdjacentQuotes(): void {
  let cur: LexicalNode | null = $getRoot().getFirstChild();
  while (cur != null) {
    // Cache the next sibling BEFORE inserting, so the iteration walks the
    // original linked list rather than landing on the freshly-inserted
    // spacer (which would be a no-op next iteration but reads as a code
    // smell).
    const next: LexicalNode | null = cur.getNextSibling();
    if ($isQuoteNode(cur) && $isQuoteNode(next)) {
      cur.insertAfter($createParagraphNode());
    }
    cur = next;
  }
}

// Build a `depth`-deep chain of nested `QuoteNode`s and place `innermost` at
// the deepest level. Returns the outermost QuoteNode (i.e. the one to attach
// to the parent of where the chain should go).
//
//   depth=1 → QuoteNode > innermost
//   depth=2 → QuoteNode > QuoteNode > innermost
//   ...
//
// Shared by the QUOTE transformer's import / typed-shortcut path, the
// `targetDepth > curDepth` branch of `$mergeIntoQuoteTree`, and
// `QuoteNestingShortcutPlugin`'s in-quote `> ` shortcut — all three places
// need the exact same tree shape, so encoding it in one helper keeps any
// future structural tweak (a marker class, an off-by-one in the loop, etc.)
// in a single spot.
export function $createNestedQuoteChain(depth: number, innermost: LexicalNode): QuoteNode {
  const outer = $createQuoteNode();
  let cur: QuoteNode = outer;
  for (let i = 1; i < depth; i++) {
    const inner = $createQuoteNode();
    cur.append(inner);
    cur = inner;
  }
  cur.append(innermost);
  return outer;
}

// Recursively serialise a nested QuoteNode tree. Each ParagraphNode child is
// rendered via the standard `exportChildren` callback (so inline format /
// text-match transformers run and `LineBreakNode`s become `\n`), then each
// physical line is prefixed with `> ` repeated `depth` times. Nested QuoteNode
// children recurse with `depth + 1`.
function $exportNestedQuote(
  quote: QuoteNode,
  exportChildren: (node: ElementNode) => string,
  depth: number,
): string[] {
  const prefix = "> ".repeat(depth);
  const lines: string[] = [];

  for (const child of quote.getChildren()) {
    if ($isQuoteNode(child)) {
      lines.push(...$exportNestedQuote(child, exportChildren, depth + 1));
    } else if ($isElementNode(child)) {
      // ParagraphNode (or any other element-shaped child). `exportChildren`
      // walks its inline descendants through the same transformer pipeline as
      // top-level paragraph export — bold / italic / code / links / autolinks
      // all serialise correctly without us reimplementing them.
      const inner = exportChildren(child);
      for (const line of inner.split("\n")) {
        lines.push(prefix + line);
      }
    } else if ($isLineBreakNode(child)) {
      // Defensive: a `LineBreakNode` directly inside a QuoteNode (instead of
      // inside a child ParagraphNode) is upstream's pre-wrapping shape — a
      // file paste, a node-transform glitch, or any legacy state could land
      // it here. Treat it as a blank quote line so the boundary survives the
      // round-trip; without this the for-loop would silently skip it and the
      // adjacent text would merge across the missing break.
      lines.push(prefix);
    } else if ($isTextNode(child)) {
      // Defensive: a TextNode directly under a QuoteNode (upstream's flat
      // shape, or a paste path that bypasses our transformer) — emit its raw
      // text so saved content survives the round-trip. Inline format flags
      // are lost here (we can't run them through `exportChildren` for a leaf
      // node), but losing format is strictly better than losing the line of
      // content entirely.
      lines.push(prefix + child.getTextContent());
    }
  }

  if (lines.length === 0) {
    // Defensive: a QuoteNode with no children shouldn't occur in practice, but
    // if it does, emit a single empty quote line at this depth. The trailing
    // space matters — `QUOTE_REGEX` requires `>\s` per level, so a bare `>`
    // wouldn't round-trip and the empty line would silently turn into a
    // literal `>` paragraph on the next load.
    lines.push(prefix);
  }

  return lines;
}

// Splice a `> ...` line into an existing QuoteNode tree at `targetDepth`,
// relative to `outer` (so `outer` itself is depth 1). The tail is found by
// walking `getLastChild()` down through nested QuoteNodes; that's the current
// depth at which subsequent lines would naturally continue. Used both by the
// QUOTE transformer's import path and by `QuoteNestingShortcutPlugin`'s
// previous-is-quote merge (live typing of `> ` on an outer-quote line below
// an existing nested QuoteNode must converge to the same tree shape as
// reloading the saved Markdown).
//
//   target === tail  → append paragraph at the same depth (a new quote line)
//   target  >  tail  → open `target - tail` more nested QuoteNodes via
//                      `$createNestedQuoteChain`, attach the chain at tail
//   target  <  tail  → re-descend the OUTER quote's last-child path only to
//                      `target`, append paragraph there (the line returned to
//                      a shallower level)
export function $mergeIntoQuoteTree(
  outer: QuoteNode,
  newParagraph: ParagraphNode,
  targetDepth: number,
): void {
  const [tail, tailDepth] = $tailOfQuote(outer);

  if (targetDepth === tailDepth) {
    tail.append(newParagraph);
    return;
  }

  if (targetDepth > tailDepth) {
    tail.append($createNestedQuoteChain(targetDepth - tailDepth, newParagraph));
    return;
  }

  // targetDepth < tailDepth: walk back UP the tail to a shallower level by
  // re-descending from `outer` to exactly `targetDepth`.
  $descendQuoteToDepth(outer, targetDepth).append(newParagraph);
}

// Walk `outer`'s last-child path down through nested QuoteNodes until the
// last child is no longer a QuoteNode (i.e. it's a ParagraphNode or absent).
// Returns the deepest QuoteNode and its depth from `outer` (1-based, so
// `outer` itself is depth 1).
function $tailOfQuote(outer: QuoteNode): [QuoteNode, number] {
  let cur: QuoteNode = outer;
  let depth = 1;
  while (true) {
    const last = cur.getLastChild();
    if (!$isQuoteNode(last)) {
      return [cur, depth];
    }
    cur = last;
    depth++;
  }
}

// Re-descend `outer`'s last-child path exactly `targetDepth - 1` steps and
// return the QuoteNode at that depth. Callers guarantee the path exists (in
// practice this is only used when stepping UP from a deeper tail to a known
// shallower level, so the intermediate QuoteNodes are the ones the same
// import session just created).
function $descendQuoteToDepth(outer: QuoteNode, targetDepth: number): QuoteNode {
  let cur: QuoteNode = outer;
  for (let i = 1; i < targetDepth; i++) {
    const last = cur.getLastChild();
    if (!$isQuoteNode(last)) {
      // Should never happen for our callers, but if the tree shape unexpect-
      // edly diverges fall back to `outer` — losing the depth target is
      // safer than throwing mid-import.
      return outer;
    }
    cur = last;
  }
  return cur;
}

// Tighten upstream CHECK_LIST in two ways:
//
//   1. `[-*+]\s` (NOT upstream's `(?:[-*+]\s)?\s?`) requires exactly one marker-and-
//      single-space prefix. Upstream allowed both a bare `[ ] task` (no dash) AND a
//      `-  [ ] task` (double space). The double-space case round-trips through
//      `$listExport` as `- [ ] task` (single space) and re-imports as a check item —
//      meaning a typed `-  [ ] task` would silently rewrite itself on save / reload.
//      The no-dash case (`[ ] task`) similarly imports as a check item but is
//      indistinguishable from literal `[ ] task` text the user might want to keep.
//      GFM accepts `-` / `*` / `+` as task list markers (the test lives at the list
//      item level, not the marker level — see
//      https://github.github.com/gfm/#task-list-items-extension-); we accept all three
//      for parity with GitHub's renderer, but require exactly one whitespace between
//      the marker and the bracket so on-disk text and the editor's rendering stay in
//      lockstep — both `[ ] task` (no dash) and `-  [ ] task` (extra space) stay
//      literal text, end to end.
//
//   2. Inner `(\s|x)` (NOT upstream's `(\s|x)?`) makes the bracket content mandatory.
//      Upstream allowed `[]` (empty brackets); listReplace defaulted it to unchecked and
//      $listExport wrote it back as `[ ]` — another silent on-disk rewrite. Requiring a
//      non-empty inner character preserves `[]` as literal text instead of normalizing it.
//
// Group indices are unchanged from upstream (1=indent, 2=full `[x]`/`[ ]`, 3=inner
// space/x), so `listReplace('check')` inherited via the spread reads the same
// `match[3]==='x'` checked flag and `match[0].trim()[0]` list marker as before. The
// `match[0].trim()[0]` carry-through is what lets `* [ ] task` / `+ [ ] task` round-trip
// with their original markers intact — listReplace stores the matched char on the new
// check list's `listMarkerState`, and `$listExport` writes `${listMarker} [...]` (NOT a
// hardcoded `-`) when serializing back.
//
// CHECK_LIST has to lead the list transformers regardless: import / shortcut both pick the
// first match (see `$importBlocks` in @lexical/markdown), so `- [ ] task` would read as a
// bullet item with text `[ ] task` if UNORDERED_LIST's `^(\s*)[-*+]\s/` was tried first.
const STRICT_CHECK_LIST_REGEX = /^(\s*)[-*+]\s(\[(\s|x)\])\s/i;
const STRICT_CHECK_LIST: ElementTransformer = {
  ...CHECK_LIST,
  regExp: STRICT_CHECK_LIST_REGEX,
};
const CELL_AWARE_LIST_TRANSFORMERS = [STRICT_CHECK_LIST, UNORDERED_LIST, ORDERED_LIST].map(
  cellAware,
);
// QUOTE is wrapped the same way: a `> note` typed live in a cell, or a
// reloaded `| > note |` whose decoded body starts with `> `, must stay
// literal text. Building a QuoteNode inside a TableCellNode would mix the
// quote key-surface (Enter / Backspace / our QuoteEnterPlugin) with the
// cell key-surface (TableKeyboardPlugin's row/column navigation) and the
// editor's CSS (`.cork-quote p { margin: 0 }`) would also start zeroing
// margins on cell paragraphs that happen to live under the quote — same
// rationale as the list cell-aware wrappers.
const CELL_AWARE_QUOTE = cellAware(QUOTE);

// Override upstream `CODE` so a fenced code block round-trips byte-identically.
// Verified against `@lexical/markdown@0.36.x` (see
// `node_modules/@lexical/markdown/dist/LexicalMarkdown.dev.mjs` lines 306–409
// at the time of writing). Three independent upstream behaviours conspire to
// silently rewrite the on-disk shape; we patch all three here:
//
//   1. Import drops blank lines around the body.
//      `CODE.replace`'s multi-line branch runs `linesInBetween.shift()` for one
//      leading blank line and `while (...pop())` for every trailing blank line,
//      so `` ```\n\n\naaa\n\n\n``` `` collapses to `` ```\n\naaa\n``` `` after
//      one round-trip and to `` ```\naaa\n``` `` after the next.
//
//   2. Import & export together lose the 0-blank vs 1-blank distinction.
//      Both `` ```\n``` `` (empty block) and `` ```\n\n``` `` (one blank line)
//      land in the tree as a CodeNode whose `textContent === ""`, and upstream
//      `CODE.export` skips the body separator (`textContent ? '\n' + textContent
//      : ''`) for an empty text — so the single-blank case re-exports as the
//      empty form. We carry the original "had a body" flag forward in a
//      lexical state slot (`corkCodeHadBodyState`).
//
//   3. Fence width is not preserved.
//      Upstream stores the literal opening fence in an internal
//      `codeFenceState` and reads it back on export, but the state isn't
//      exported from the package's public entry, so a `replace`-only override
//      can't write it. A `` ```` `` fence (typical when the body contains
//      triple backticks) silently downgrades to `` ``` ``; we mirror the
//      slot under `corkCodeFenceState`.
//
// `handleImportAfterStartMatch` has to be overridden alongside the
// representation changes because upstream's implementation closes over the
// module-local `CODE` symbol and calls `CODE.replace(...)` directly — a
// `replace`-only override is silently bypassed on the import path that hits
// `handleImportAfterStartMatch`. The `replace` property is dropped because
// the only reachable caller (live-typing through `MarkdownShortcutPlugin`)
// arrives with `children != null`, which is handled by the inherited
// `DEFAULT_CODE.replace` via the `...DEFAULT_CODE` spread.
//
// Upstream is tracked at https://github.com/facebook/lexical/blob/main/packages/lexical-markdown/src/MarkdownTransformers.ts
// — delete this override when upstream lands a fix that preserves blank lines
// + fence width + lets the state slot be reused.

const corkCodeFenceState = createState("corkCodeFence", {
  parse: (val) => (typeof val === "string" && /^`{3,}$/.test(val) ? val : "```"),
  resetOnCopyNode: true,
});

const corkCodeHadBodyState = createState("corkCodeHadBody", {
  parse: (val) => val === true,
  resetOnCopyNode: true,
});

const CODE: MultilineElementTransformer = {
  ...DEFAULT_CODE,
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex, startMatch }) => {
    const fence = startMatch[1].trim();
    const fenceLength = fence.length;
    const currentLine = lines[startLineIndex];
    const afterFenceIndex = (startMatch.index ?? 0) + startMatch[1].length;
    const afterFence = currentLine.slice(afterFenceIndex);
    const language = startMatch[2] || undefined;

    // Single-line case: opening fence and closing fence on the same line
    // (e.g. `` ```js console.log()``` `` — rare in saved files but the
    // upstream regex still accepts it and so do we).
    const singleLineEndRegex = new RegExp(`\`{${fenceLength},}$`);
    if (singleLineEndRegex.test(afterFence)) {
      const endMatch = afterFence.match(singleLineEndRegex);
      const content = afterFence.slice(0, afterFence.lastIndexOf(endMatch![0]));
      $appendPreservedCodeNode(rootNode, undefined, fence, [content]);
      return [true, startLineIndex];
    }

    // Multi-line case: walk forward until we find the closing fence (or
    // run off the end of the document, mirroring upstream's optional
    // regExpEnd).
    const multilineEndRegex = new RegExp(`^[ \\t]*\`{${fenceLength},}$`);
    for (let i = startLineIndex + 1; i < lines.length; i++) {
      if (multilineEndRegex.test(lines[i])) {
        const linesInBetween = $assembleLinesInBetween(
          lines.slice(startLineIndex + 1, i),
          currentLine.slice(startMatch[0].length),
        );
        $appendPreservedCodeNode(rootNode, language, fence, linesInBetween);
        return [true, i];
      }
    }
    const linesInBetween = $assembleLinesInBetween(
      lines.slice(startLineIndex + 1),
      currentLine.slice(startMatch[0].length),
    );
    $appendPreservedCodeNode(rootNode, language, fence, linesInBetween);
    return [true, lines.length - 1];
  },
  export: (node) => {
    if (!$isCodeNode(node)) {
      return null;
    }
    const textContent = node.getTextContent();
    let fence = $getState(node, corkCodeFenceState);
    // Bump fence width if the body itself contains the current fence —
    // matches upstream's collision handling so a saved block never
    // accidentally terminates on its own content.
    if (textContent.indexOf(fence) > -1) {
      const matches = textContent.match(/`{3,}/g);
      if (matches) {
        const maxLength = Math.max(...matches.map((b) => b.length));
        fence = "`".repeat(maxLength + 1);
      }
    }
    const language = node.getLanguage() || "";
    // Two cases lead to "the original file had a body separator":
    //   - imported with at least one line between the fences (state set)
    //   - live-typed content (textContent grew past empty)
    // Either way, emit the body so the file shape is stable across saves.
    const hadBody = $getState(node, corkCodeHadBodyState) || textContent.length > 0;
    const body = hadBody ? `\n${textContent}` : "";
    return `${fence}${language}${body}\n${fence}`;
  },
};

function $assembleLinesInBetween(
  innerLines: Array<string>,
  afterOpenFenceFullMatch: string,
): Array<string> {
  // Content typed on the opening-fence line itself (e.g. `` ```js extra ``)
  // is prepended as the first body line. Upstream also stripped one leading
  // space here; we keep that strip so authored same-line content round-trips
  // verbatim (the `[ \t]?` in CODE_START_REGEX has already swallowed up to
  // one separator).
  if (afterOpenFenceFullMatch.length > 0) {
    innerLines.unshift(
      afterOpenFenceFullMatch.startsWith(" ")
        ? afterOpenFenceFullMatch.slice(1)
        : afterOpenFenceFullMatch,
    );
  }
  return innerLines;
}

function $appendPreservedCodeNode(
  rootNode: ElementNode,
  language: string | undefined,
  fence: string,
  linesInBetween: Array<string>,
): void {
  const codeBlockNode = $createCodeNode(language);
  $setState(codeBlockNode, corkCodeFenceState, fence);
  if (linesInBetween.length > 0) {
    $setState(codeBlockNode, corkCodeHadBodyState, true);
    codeBlockNode.append($createTextNode(linesInBetween.join("\n")));
  }
  rootNode.append(codeBlockNode);
}

const NON_LIST_NON_QUOTE_DEFAULTS = TRANSFORMERS.filter(
  (t) =>
    t !== UNORDERED_LIST &&
    t !== ORDERED_LIST &&
    t !== CHECK_LIST &&
    t !== DEFAULT_QUOTE &&
    t !== DEFAULT_CODE,
);

// TABLE leads so its row regExp wins before the default element transformers
// (e.g. a leading-pipe line is a table row, not a quote). HORIZONTAL_RULE
// follows so `---`/`***`/`___` lines become a rule before any default element
// transformer sees them. Both are defined here because the TABLE transformer
// recurses into this list for cell bodies. QUOTE is our nesting-aware
// replacement for upstream's flat single-level QUOTE (see comment block on
// the transformer itself). The list transformers come from @lexical/markdown
// but are cell-aware-wrapped so they don't try to build a ListNode inside a
// cell (which would erase the typed `- ` marker).
export const MARKDOWN_TRANSFORMERS: Array<Transformer> = [
  TABLE,
  HORIZONTAL_RULE,
  CELL_AWARE_QUOTE,
  CODE,
  ...CELL_AWARE_LIST_TRANSFORMERS,
  ...NON_LIST_NON_QUOTE_DEFAULTS,
];

// Split for the shortcut pipeline. `FormatShortcutPlugin` owns text-format
// transformers (the upstream `$runTextFormatTransformers` is buggy — wrapping
// already-formatted text with the same tag un-formats it; see that file's
// header), so we hand only the non-format transformers to Lexical's
// `MarkdownShortcutPlugin`. Import/export still use the full list above.
export const MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS: Array<Transformer> =
  MARKDOWN_TRANSFORMERS.filter((t) => t.type !== "text-format");
export const MARKDOWN_TEXT_FORMAT_SHORTCUT_TRANSFORMERS: Array<TextFormatTransformer> =
  MARKDOWN_TRANSFORMERS.filter((t): t is TextFormatTransformer => t.type === "text-format");
