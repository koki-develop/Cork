import { $createListItemNode, $createListNode, $isListItemNode, $isListNode } from "@lexical/list";
import { $createTextNode, $getRoot, INDENT_CONTENT_COMMAND } from "lexical";
import { describe, expect, test } from "vitest";

import { dispatchCommand, renderTestEditor } from "./__tests__/utils";
import { CheckListIndentPlugin } from "./CheckListIndentPlugin";

describe("CheckListIndentPlugin", () => {
  // Same-type indent — a bullet item whose previous sibling is a wrapping LI
  // that holds a BULLET nested list. The item appends into the existing nested
  // list (matching upstream's structural shape for the same-type case).
  //
  // Before:
  //   - aaa
  //     - bbb
  //   - |ccc
  //
  // After indent:
  //   - aaa
  //     - bbb
  //     - |ccc
  test("Bullet item indenting next to a bullet-containing wrapping LI appends to the same nested list", async () => {
    const { editor } = await renderTestEditor({
      plugins: <CheckListIndentPlugin />,
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const outer = $createListNode("bullet");
        const aaa = $createListItemNode();
        aaa.append($createTextNode("aaa"));
        const wrapper = $createListItemNode();
        const nested = $createListNode("bullet");
        const bbb = $createListItemNode();
        bbb.append($createTextNode("bbb"));
        nested.append(bbb);
        wrapper.append(nested);
        const ccc = $createListItemNode();
        ccc.append($createTextNode("ccc"));
        outer.append(aaa, wrapper, ccc);
        root.append(outer);
        ccc.selectStart();
      },
      { discrete: true },
    );

    dispatchCommand(editor, INDENT_CONTENT_COMMAND, undefined);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);
      const outer = root.getFirstChild();
      if (!$isListNode(outer)) throw new Error("expected ListNode at root[0]");
      expect(outer.getListType()).toBe("bullet");
      // After the indent, outer has [aaa, wrapper] — the trailing `ccc` is
      // gone from outer because it migrated into the existing nested list.
      expect(outer.getChildrenSize()).toBe(2);

      const firstItem = outer.getChildAtIndex(0);
      if (!$isListItemNode(firstItem)) throw new Error("expected ListItemNode at outer[0]");
      expect(firstItem.getTextContent()).toBe("aaa");

      const wrappingItem = outer.getChildAtIndex(1);
      if (!$isListItemNode(wrappingItem)) throw new Error("expected ListItemNode at outer[1]");
      expect(wrappingItem.getChildrenSize()).toBe(1);

      const nested = wrappingItem.getFirstChild();
      if (!$isListNode(nested)) throw new Error("expected nested ListNode");
      expect(nested.getListType()).toBe("bullet");
      expect(nested.getChildrenSize()).toBe(2);
      expect(nested.getChildAtIndex(0)?.getTextContent()).toBe("bbb");
      expect(nested.getChildAtIndex(1)?.getTextContent()).toBe("ccc");
    });
  });

  // Type-mismatch indent — the bug the plugin exists for. A bullet item whose
  // previous sibling is a wrapping LI that holds a CHECK nested list. Upstream
  // `$handleIndent` would blindly append into the check list (silently making
  // `ccc` a check item). The plugin instead creates a NEW wrapping LI holding
  // a fresh BULLET nested list so `ccc` keeps its bullet semantic.
  //
  // Before:
  //   - aaa
  //     - [ ] bbb
  //   - |ccc
  //
  // After indent:
  //   - aaa
  //     - [ ] bbb
  //     - |ccc        ← ccc is in its OWN nested bullet list, NOT a check item
  test("Bullet item indenting next to a check-containing wrapping LI creates a new bullet wrapping (no silent type flip)", async () => {
    const { editor } = await renderTestEditor({
      plugins: <CheckListIndentPlugin />,
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const outer = $createListNode("bullet");
        const aaa = $createListItemNode();
        aaa.append($createTextNode("aaa"));
        // Wrapping LI holding a CHECK nested list.
        const checkWrapper = $createListItemNode();
        const checkNested = $createListNode("check");
        const bbb = $createListItemNode(false);
        bbb.append($createTextNode("bbb"));
        checkNested.append(bbb);
        checkWrapper.append(checkNested);
        const ccc = $createListItemNode();
        ccc.append($createTextNode("ccc"));
        outer.append(aaa, checkWrapper, ccc);
        root.append(outer);
        ccc.selectStart();
      },
      { discrete: true },
    );

    dispatchCommand(editor, INDENT_CONTENT_COMMAND, undefined);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);
      const outer = root.getFirstChild();
      if (!$isListNode(outer)) throw new Error("expected ListNode at root[0]");
      // Outer now has [aaa, checkWrapper, newBulletWrapper] — the new wrapping
      // LI for ccc was added next to the existing check wrapper.
      expect(outer.getChildrenSize()).toBe(3);

      const firstItem = outer.getChildAtIndex(0);
      if (!$isListItemNode(firstItem)) throw new Error("expected ListItemNode at outer[0]");
      expect(firstItem.getTextContent()).toBe("aaa");

      const checkWrapping = outer.getChildAtIndex(1);
      if (!$isListItemNode(checkWrapping)) throw new Error("expected ListItemNode at outer[1]");
      const checkNestedAfter = checkWrapping.getFirstChild();
      if (!$isListNode(checkNestedAfter))
        throw new Error("expected check ListNode inside outer[1]");
      // Check nested list is UNTOUCHED (still 1 item "bbb", still type check).
      expect(checkNestedAfter.getListType()).toBe("check");
      expect(checkNestedAfter.getChildrenSize()).toBe(1);
      expect(checkNestedAfter.getTextContent()).toBe("bbb");

      const bulletWrapping = outer.getChildAtIndex(2);
      if (!$isListItemNode(bulletWrapping)) throw new Error("expected ListItemNode at outer[2]");
      const bulletNested = bulletWrapping.getFirstChild();
      if (!$isListNode(bulletNested)) throw new Error("expected nested ListNode inside outer[2]");
      // The critical assertion: the new nested list is BULLET, not check.
      // A regression here would render ccc with a checkbox.
      expect(bulletNested.getListType()).toBe("bullet");
      expect(bulletNested.getChildrenSize()).toBe(1);
      const cccItem = bulletNested.getFirstChild();
      if (!$isListItemNode(cccItem))
        throw new Error("expected ListItemNode inside new bullet nested");
      expect(cccItem.getTextContent()).toBe("ccc");
    });
  });
});
