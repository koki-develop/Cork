import { $createListItemNode, $createListNode, $isListNode } from "@lexical/list";
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
  $isElementNode,
  $isParagraphNode,
  type LexicalNode,
} from "lexical";
import { describe, expect, test } from "vitest";

import { renderTestEditor } from "./__tests__/utils";
import { NoListInTablePlugin } from "./NoListInTablePlugin";

// NoListInTablePlugin is the safety net for the "no lists in table cells"
// rule. The first line of defense is the cell-aware transformer wrappers
// in transformers.ts (covered by transformers.table.spec.ts) — they keep
// `- foo` / `1. foo` / `- [ ] foo` typed in a cell or arriving from the
// import path as literal text. This plugin handles the OTHER paths a
// ListNode could land in a cell:
//
//   - A raw INSERT_UNORDERED_LIST_COMMAND / INSERT_ORDERED_LIST_COMMAND /
//     INSERT_CHECK_LIST_COMMAND dispatched while the caret is in a cell.
//   - A paste that drops pre-built Lexical ListNodes into a cell.
//
// The cleanup shape: each ListItemNode is replaced by a ParagraphNode
// carrying its inline children; any nested ListNode is lifted out of the
// item into the cell as a sibling so the next transform pass unwraps it
// too. Lexical re-fires the transform on every dirty ListNode until the
// cell holds none, so even deeply nested lists flatten across passes.
//
// Before/After diagrams below show the cell's subtree (the table+row
// scaffolding is constant across each test).

function $seedTableWithEmptyCell(): TableNode {
  const table = $createTableNode();
  const row = $createTableRowNode();
  const cell = $createTableCellNode(TableCellHeaderStates.NO_STATUS);
  cell.append($createParagraphNode());
  row.append(cell);
  table.append(row);
  return table;
}

function getOnlyCell(table: TableNode): TableCellNode {
  const row = table.getFirstChild();
  if (!$isTableRowNode(row)) throw new Error("expected TableRowNode at table[0]");
  const cell = row.getFirstChild();
  if (!$isTableCellNode(cell)) throw new Error("expected TableCellNode at row[0]");
  return cell;
}

describe("NoListInTablePlugin", () => {
  // A flat bullet ListNode placed into a cell (e.g. via a paste of
  // pre-built nodes, since the typing path can't get here) is unwrapped on
  // commit. Each ListItem becomes a ParagraphNode with the item's inline
  // children; the ListNode itself is removed.
  //
  // Before — cell holds a flat bullet ListNode:
  //   TableCellNode
  //     ListNode (bullet)
  //       ListItemNode "aaa"
  //       ListItemNode "bbb"
  //
  // After NoListInTablePlugin's transform — list unwrapped to paragraphs:
  //   TableCellNode
  //     ParagraphNode "aaa"
  //     ParagraphNode "bbb"
  test("a flat bullet ListNode inserted into a cell is unwrapped to ParagraphNodes", async () => {
    const { editor } = await renderTestEditor({
      plugins: (
        <>
          <TablePlugin hasHorizontalScroll />
          <NoListInTablePlugin />
        </>
      ),
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTableWithEmptyCell();
        root.append(table);

        const cell = getOnlyCell(table);
        // Clear the placeholder paragraph; we'll fill the cell with a
        // ListNode the same way a paste of pre-built nodes would.
        cell.clear();
        const list = $createListNode("bullet");
        const item1 = $createListItemNode();
        item1.append($createTextNode("aaa"));
        const item2 = $createListItemNode();
        item2.append($createTextNode("bbb"));
        list.append(item1, item2);
        cell.append(list);
      },
      { discrete: true },
    );

    // After the update commits, NoListInTablePlugin's node-transform fires
    // on the dirty ListNode and rewrites the cell. Read the post-transform
    // state.
    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      const cell = getOnlyCell(table);

      // List unwrapped — cell now holds 2 ParagraphNodes, one per former
      // list item, each carrying the item's text.
      expect(cell.getChildrenSize()).toBe(2);
      const p1 = cell.getChildAtIndex(0);
      const p2 = cell.getChildAtIndex(1);
      if (!$isParagraphNode(p1)) throw new Error("expected ParagraphNode at cell[0]");
      if (!$isParagraphNode(p2)) throw new Error("expected ParagraphNode at cell[1]");
      expect(p1.getTextContent()).toBe("aaa");
      expect(p2.getTextContent()).toBe("bbb");

      // No ListNode survives anywhere under the cell.
      const hasList = cell.getChildren().some($isListNode);
      expect(hasList).toBe(false);
    });
  });

  // Same unwrap shape for ordered (numbered) lists — the transform doesn't
  // care about the list type. ParagraphNodes only.
  //
  // Before — cell holds an ordered ListNode:
  //   TableCellNode
  //     ListNode (number)
  //       ListItemNode "xyz"
  //
  // After — list unwrapped to a paragraph:
  //   TableCellNode
  //     ParagraphNode "xyz"
  test("an ordered ListNode inserted into a cell is unwrapped to ParagraphNodes", async () => {
    const { editor } = await renderTestEditor({
      plugins: (
        <>
          <TablePlugin hasHorizontalScroll />
          <NoListInTablePlugin />
        </>
      ),
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTableWithEmptyCell();
        root.append(table);

        const cell = getOnlyCell(table);
        cell.clear();
        const list = $createListNode("number");
        const item = $createListItemNode();
        item.append($createTextNode("xyz"));
        list.append(item);
        cell.append(list);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      const cell = getOnlyCell(table);

      expect(cell.getChildrenSize()).toBe(1);
      const p = cell.getFirstChild();
      if (!$isParagraphNode(p)) throw new Error("expected ParagraphNode at cell[0]");
      expect(p.getTextContent()).toBe("xyz");
      const hasList = cell.getChildren().some($isListNode);
      expect(hasList).toBe(false);
    });
  });

  // Check list — same unwrap; the `__checked` state of items is dropped on
  // unwrap (paragraphs carry no checked state). Mirror of the cell-aware
  // STRICT_CHECK_LIST import path: `- [ ] foo` inside a cell reloads as
  // literal text, no checkbox.
  //
  // Before — cell holds a check ListNode with one CHECKED item:
  //   TableCellNode
  //     ListNode (check)
  //       ListItemNode (checked=true) "done"
  //
  // After — list unwrapped, checked state lost:
  //   TableCellNode
  //     ParagraphNode "done"   ← no checkbox; just the text
  test("a check ListNode inserted into a cell is unwrapped to ParagraphNodes (checked state dropped)", async () => {
    const { editor } = await renderTestEditor({
      plugins: (
        <>
          <TablePlugin hasHorizontalScroll />
          <NoListInTablePlugin />
        </>
      ),
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTableWithEmptyCell();
        root.append(table);

        const cell = getOnlyCell(table);
        cell.clear();
        const list = $createListNode("check");
        const item = $createListItemNode();
        item.setChecked(true);
        item.append($createTextNode("done"));
        list.append(item);
        cell.append(list);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      const cell = getOnlyCell(table);

      expect(cell.getChildrenSize()).toBe(1);
      const p = cell.getFirstChild();
      if (!$isParagraphNode(p)) throw new Error("expected ParagraphNode at cell[0]");
      expect(p.getTextContent()).toBe("done");
      const hasList = cell.getChildren().some($isListNode);
      expect(hasList).toBe(false);
    });
  });

  // A nested list inside an item is LIFTED out as a sibling of the outer
  // list (not unwrapped on the same pass); the next Lexical transform pass
  // unwraps it too. End state: cell holds only ParagraphNodes, no
  // ListNodes anywhere in the subtree. The transform re-fires on every
  // dirty ListNode until none remain in the cell.
  //
  // Before — cell holds an outer bullet list with a nested bullet list:
  //   TableCellNode
  //     ListNode (bullet, outer)
  //       ListItemNode "aaa"
  //       ListItemNode (wrapping)
  //         ListNode (bullet, nested)
  //           ListItemNode "bbb"
  //
  // After the multi-pass transform — both lists gone:
  //   TableCellNode
  //     ParagraphNode "..." (containing "aaa")
  //     ParagraphNode "..." (containing "bbb")
  //   (no ListNode anywhere — lifted nested list got the same unwrap on the
  //    next pass)
  test("a nested bullet list inside a cell flattens across passes — no ListNode survives", async () => {
    const { editor } = await renderTestEditor({
      plugins: (
        <>
          <TablePlugin hasHorizontalScroll />
          <NoListInTablePlugin />
        </>
      ),
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTableWithEmptyCell();
        root.append(table);

        const cell = getOnlyCell(table);
        cell.clear();

        // outer:
        //   - aaa
        //   - (wrapping item)
        //     - bbb
        const outer = $createListNode("bullet");
        const aaa = $createListItemNode();
        aaa.append($createTextNode("aaa"));
        const wrapper = $createListItemNode();
        const nested = $createListNode("bullet");
        const bbb = $createListItemNode();
        bbb.append($createTextNode("bbb"));
        nested.append(bbb);
        wrapper.append(nested);
        outer.append(aaa, wrapper);
        cell.append(outer);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      const cell = getOnlyCell(table);

      // After the multi-pass transform, NO ListNode survives anywhere in
      // the cell's subtree (recursive scan — nested lists could otherwise
      // hide inside lifted siblings if the multi-pass logic broke).
      function hasListDeep(node: LexicalNode | null): boolean {
        if (node == null) return false;
        if ($isListNode(node)) return true;
        if (!$isElementNode(node)) return false;
        for (const c of node.getChildren()) {
          if (hasListDeep(c)) return true;
        }
        return false;
      }
      for (const child of cell.getChildren()) {
        expect(hasListDeep(child)).toBe(false);
      }

      // Both items ("aaa" and "bbb") survive as ParagraphNodes in the
      // cell. They may not be in a deterministic order — the lift puts
      // the nested list BEFORE the outer item's paragraph on the lift
      // pass — but both contents end up at the cell level.
      const cellText = cell.getTextContent();
      expect(cellText).toContain("aaa");
      expect(cellText).toContain("bbb");
    });
  });

  // A ListNode at root (NOT in any cell) is left alone — the plugin's
  // `$findMatchingParent(node, $isTableCellNode)` returns null and the
  // transform early-exits. Lists outside cells are the normal supported
  // case.
  //
  // Before — bullet list at root:
  //   ListNode (bullet)
  //     ListItemNode "hello"
  //
  // After — no unwrap (plugin's findMatchingParent for cell returns null):
  //   ListNode (bullet)         ← unchanged
  //     ListItemNode "hello"
  test("a ListNode at root (not in a cell) is left alone", async () => {
    const { editor } = await renderTestEditor({
      plugins: (
        <>
          <TablePlugin hasHorizontalScroll />
          <NoListInTablePlugin />
        </>
      ),
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const list = $createListNode("bullet");
        const item = $createListItemNode();
        item.append($createTextNode("hello"));
        list.append(item);
        root.append(list);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);
      const list = root.getFirstChild();
      // The ListNode is intact at root — no unwrap.
      if (!$isListNode(list)) throw new Error("expected ListNode at root[0]");
      expect(list.getTextContent()).toBe("hello");
    });
  });
});
