import { $createListItemNode, $createListNode, $isListItemNode, $isListNode } from "@lexical/list";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
} from "lexical";
import { describe, expect, test } from "vitest";

import { dispatchKeyDown, renderTestEditor } from "./__tests__/utils";
import { CheckListOutdentPlugin } from "./CheckListOutdentPlugin";
import { ListExitPlugin } from "./ListExitPlugin";

describe("ListExitPlugin", () => {
  // Backspace on an empty top-level bullet item exits the list — the plugin
  // dispatches `INSERT_PARAGRAPH_COMMAND` into ListPlugin's empty-item handler,
  // which extracts the item out as a fresh paragraph at root and drops the
  // now-empty list.
  //
  // Before:
  //   - |
  //
  // After Backspace:
  //   |
  test("Backspace on an empty top-level bullet item exits the list to a paragraph at root", async () => {
    const { editor } = await renderTestEditor({
      plugins: (
        <>
          <ListPlugin />
          <ListExitPlugin />
        </>
      ),
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const list = $createListNode("bullet");
        const item = $createListItemNode();
        list.append(item);
        root.append(list);
        item.selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Backspace");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const child = root.getFirstChild();
      if (!$isParagraphNode(child)) throw new Error("expected ParagraphNode at root[0]");
      expect($isListNode(child)).toBe(false);
      expect(child.getTextContent()).toBe("");

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      expect(selection.isCollapsed()).toBe(true);
      const anchor = selection.anchor.getNode();
      const anchorParagraph = $isParagraphNode(anchor) ? anchor : anchor.getParent();
      expect(anchorParagraph?.getKey()).toBe(child.getKey());
      expect(selection.anchor.offset).toBe(0);
    });
  });

  // Backspace at the start of a non-empty top-level bullet item replaces the
  // item with a ParagraphNode carrying its inline children, splitting the
  // surrounding list around the cut so the items before / after stay in
  // separate ListNodes.
  //
  // Before:
  //   - aaa
  //   - |bbb
  //   - ccc
  //
  // After Backspace:
  //   - aaa
  //   |bbb
  //   - ccc
  test("Backspace at the start of a non-empty top-level bullet item replaces it with a paragraph and splits the list", async () => {
    const { editor } = await renderTestEditor({
      plugins: <ListExitPlugin />,
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const list = $createListNode("bullet");
        const i1 = $createListItemNode();
        i1.append($createTextNode("aaa"));
        const i2 = $createListItemNode();
        i2.append($createTextNode("bbb"));
        const i3 = $createListItemNode();
        i3.append($createTextNode("ccc"));
        list.append(i1, i2, i3);
        root.append(list);
        i2.selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Backspace");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(3);

      const leadingList = root.getChildAtIndex(0);
      if (!$isListNode(leadingList)) throw new Error("expected ListNode at root[0]");
      expect(leadingList.getChildrenSize()).toBe(1);
      const leadingItem = leadingList.getFirstChild();
      if (!$isListItemNode(leadingItem))
        throw new Error("expected ListItemNode at root[0]/list[0]");
      expect(leadingItem.getTextContent()).toBe("aaa");

      const middle = root.getChildAtIndex(1);
      if (!$isParagraphNode(middle)) throw new Error("expected ParagraphNode at root[1]");
      expect(middle.getTextContent()).toBe("bbb");

      const trailingList = root.getChildAtIndex(2);
      if (!$isListNode(trailingList)) throw new Error("expected ListNode at root[2]");
      expect(trailingList.getChildrenSize()).toBe(1);
      const trailingItem = trailingList.getFirstChild();
      if (!$isListItemNode(trailingItem))
        throw new Error("expected ListItemNode at root[2]/list[0]");
      expect(trailingItem.getTextContent()).toBe("ccc");

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      expect(selection.isCollapsed()).toBe(true);
      const anchor = selection.anchor.getNode();
      const anchorParagraph = $isParagraphNode(anchor) ? anchor : anchor.getParent();
      expect(anchorParagraph?.getKey()).toBe(middle.getKey());
      expect(selection.anchor.offset).toBe(0);
    });
  });

  // Backspace at the start of a non-empty nested item dispatches
  // OUTDENT_CONTENT_COMMAND (which `CheckListOutdentPlugin` services),
  // moving the item up one indent level into the outer list as a sibling of
  // the line above.
  //
  // Before:
  //   - aaa
  //     - |bbb
  //
  // After Backspace:
  //   - aaa
  //   - |bbb
  test("Backspace at the start of a non-empty nested bullet item outdents one level", async () => {
    const { editor } = await renderTestEditor({
      plugins: (
        <>
          <ListExitPlugin />
          <CheckListOutdentPlugin />
        </>
      ),
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        // Outer bullet list:
        //   - aaa
        //   - (wrapping LI)
        //     - bbb   ← cursor
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
        root.append(outer);
        bbb.selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Backspace");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const list = root.getFirstChild();
      if (!$isListNode(list)) throw new Error("expected ListNode at root[0]");
      expect(list.getChildrenSize()).toBe(2);

      const firstItem = list.getChildAtIndex(0);
      if (!$isListItemNode(firstItem)) throw new Error("expected ListItemNode at list[0]");
      expect(firstItem.getTextContent()).toBe("aaa");
      // Sibling, not a nested wrapper: firstItem's child is a TextNode, not a
      // ListNode.
      const firstFirstChild = firstItem.getFirstChild();
      if (!$isTextNode(firstFirstChild)) throw new Error("expected TextNode inside list[0]");

      const secondItem = list.getChildAtIndex(1);
      if (!$isListItemNode(secondItem)) throw new Error("expected ListItemNode at list[1]");
      expect(secondItem.getTextContent()).toBe("bbb");
      const secondFirstChild = secondItem.getFirstChild();
      if (!$isTextNode(secondFirstChild)) throw new Error("expected TextNode inside list[1]");

      // Cursor still at offset 0 of the moved "bbb" TextNode (key preserved
      // across the outdent).
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      expect(selection.isCollapsed()).toBe(true);
      const anchor = selection.anchor.getNode();
      if (!$isTextNode(anchor)) throw new Error("expected TextNode anchor");
      expect(anchor.getTextContent()).toBe("bbb");
      expect(anchor.getParent()?.getKey()).toBe(secondItem.getKey());
      expect(selection.anchor.offset).toBe(0);
    });
  });
});
