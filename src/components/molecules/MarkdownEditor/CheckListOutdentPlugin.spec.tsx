import { $createListItemNode, $createListNode, $isListItemNode, $isListNode } from "@lexical/list";
import { $createTextNode, $getRoot, OUTDENT_CONTENT_COMMAND } from "lexical";
import { describe, expect, test } from "vitest";

import { dispatchCommand, renderTestEditor } from "./__tests__/utils";
import { CheckListOutdentPlugin } from "./CheckListOutdentPlugin";

describe("CheckListOutdentPlugin", () => {
  // Same-type outdent — a nested bullet item Shift+Tab inside a bullet outer
  // list lifts up to the outer list as a sibling, mirroring upstream's shape
  // (no marker change since both inner and outer are bullets).
  //
  // Before:
  //   - aaa
  //     - |bbb
  //
  // After outdent:
  //   - aaa
  //   - |bbb
  test("Bullet item outdenting same-type lifts up to the outer list as a sibling", async () => {
    const { editor } = await renderTestEditor({
      plugins: <CheckListOutdentPlugin />,
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
        outer.append(aaa, wrapper);
        root.append(outer);
        bbb.selectStart();
      },
      { discrete: true },
    );

    dispatchCommand(editor, OUTDENT_CONTENT_COMMAND, undefined);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);
      const list = root.getFirstChild();
      if (!$isListNode(list)) throw new Error("expected ListNode at root[0]");
      expect(list.getListType()).toBe("bullet");
      expect(list.getChildrenSize()).toBe(2);

      const firstItem = list.getChildAtIndex(0);
      if (!$isListItemNode(firstItem)) throw new Error("expected ListItemNode at list[0]");
      expect(firstItem.getTextContent()).toBe("aaa");

      const secondItem = list.getChildAtIndex(1);
      if (!$isListItemNode(secondItem)) throw new Error("expected ListItemNode at list[1]");
      expect(secondItem.getTextContent()).toBe("bbb");
    });
  });

  // Type-mismatch outdent — the bug the plugin exists for. A CHECK item
  // nested inside a BULLET outer list is Shift+Tab'd. Upstream `$handleOutdent`
  // would move the item into the bullet outer list (and `ListItemNode.$transform`
  // would then clear `__checked` because the parent isn't a check list anymore
  // — silently turning the check item into a bullet item). The plugin instead
  // lifts the item into a FRESH check ListNode at the outer's parent level so
  // the check semantic survives.
  //
  // Before:
  //   - aaa
  //     - [ ] |bbb
  //
  // After outdent:
  //   - aaa
  //   - [ ] |bbb       ← bbb is in its OWN check list at root, NOT a bullet
  test("Check item outdenting through a bullet wrapper stays as a check item", async () => {
    const { editor } = await renderTestEditor({
      plugins: <CheckListOutdentPlugin />,
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const outer = $createListNode("bullet");
        const aaa = $createListItemNode();
        aaa.append($createTextNode("aaa"));
        const wrapper = $createListItemNode();
        const checkNested = $createListNode("check");
        const bbb = $createListItemNode(false);
        bbb.append($createTextNode("bbb"));
        checkNested.append(bbb);
        wrapper.append(checkNested);
        outer.append(aaa, wrapper);
        root.append(outer);
        bbb.selectStart();
      },
      { discrete: true },
    );

    dispatchCommand(editor, OUTDENT_CONTENT_COMMAND, undefined);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      // Root has 2 siblings: the original bullet outer (now just [aaa]) and a
      // fresh check ListNode holding the lifted [ ] bbb.
      expect(root.getChildrenSize()).toBe(2);

      const bulletOuter = root.getChildAtIndex(0);
      if (!$isListNode(bulletOuter)) throw new Error("expected ListNode at root[0]");
      expect(bulletOuter.getListType()).toBe("bullet");
      expect(bulletOuter.getChildrenSize()).toBe(1);
      expect(bulletOuter.getTextContent()).toBe("aaa");

      const liftedCheckList = root.getChildAtIndex(1);
      if (!$isListNode(liftedCheckList)) throw new Error("expected ListNode at root[1]");
      // The critical assertion: the lifted list is CHECK, not bullet. A
      // regression here would silently turn bbb into a bullet item.
      expect(liftedCheckList.getListType()).toBe("check");
      expect(liftedCheckList.getChildrenSize()).toBe(1);

      const liftedItem = liftedCheckList.getFirstChild();
      if (!$isListItemNode(liftedItem))
        throw new Error("expected ListItemNode inside lifted check list");
      expect(liftedItem.getChecked()).toBe(false);
      expect(liftedItem.getTextContent()).toBe("bbb");
    });
  });
});
