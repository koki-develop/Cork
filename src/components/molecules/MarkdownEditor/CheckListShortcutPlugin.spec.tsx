import { $isListItemNode, $isListNode } from "@lexical/list";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { $getRoot } from "lexical";
import { describe, expect, test } from "vitest";

import { renderTestEditor } from "./__tests__/utils";
import { CheckListShortcutPlugin } from "./CheckListShortcutPlugin";
import { MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS } from "./transformers";

describe("CheckListShortcutPlugin", () => {
  // Typing `- ` first triggers MarkdownShortcutPlugin's bullet shortcut, then
  // typing `[ ] ` inside that bullet item is caught by CheckListShortcutPlugin
  // (upstream's MarkdownShortcutPlugin won't run element transformers when
  // grandparent isn't root, so without this plugin `[ ] ` would stay literal
  // text inside the bullet item). The plugin converts the bullet item into an
  // unchecked check item, and the trailing `foo` lands inside the converted
  // item.
  //
  // Before:
  //   |
  //
  // After typing `- [ ] foo`:
  //   - [ ] foo|        (rendered as a check list with one unchecked item)
  test("`- [ ] foo` typed converts the bullet item into an unchecked check item", async () => {
    const { editor, screen, user } = await renderTestEditor({
      plugins: (
        <>
          <ListPlugin />
          <MarkdownShortcutPlugin transformers={MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS} />
          <CheckListShortcutPlugin />
        </>
      ),
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);
    // `[[` escape: vitest/browser's userEvent (Testing Library keyboard
    // syntax) reads bare `[` as a hold-key descriptor opener; close-side `]`
    // is literal so no escape needed there.
    await user.keyboard("- [[ ] foo");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const list = root.getFirstChild();
      if (!$isListNode(list)) throw new Error("expected ListNode at root[0]");
      expect(list.getListType()).toBe("check");
      expect(list.getChildrenSize()).toBe(1);

      const item = list.getFirstChild();
      if (!$isListItemNode(item)) throw new Error("expected ListItemNode at list[0]");
      expect(item.getChecked()).toBe(false);
      expect(item.getTextContent()).toBe("foo");
    });
  });

  // Same flow but with `[x]` (lowercase x) inside the marker — converts to a
  // CHECKED check item.
  //
  // Before:
  //   |
  //
  // After typing `- [x] foo`:
  //   - [x] foo|
  test("`- [x] foo` typed converts the bullet item into a checked check item", async () => {
    const { editor, screen, user } = await renderTestEditor({
      plugins: (
        <>
          <ListPlugin />
          <MarkdownShortcutPlugin transformers={MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS} />
          <CheckListShortcutPlugin />
        </>
      ),
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);
    await user.keyboard("- [[x] foo");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const list = root.getFirstChild();
      if (!$isListNode(list)) throw new Error("expected ListNode at root[0]");
      expect(list.getListType()).toBe("check");
      expect(list.getChildrenSize()).toBe(1);

      const item = list.getFirstChild();
      if (!$isListItemNode(item)) throw new Error("expected ListItemNode at list[0]");
      expect(item.getChecked()).toBe(true);
      expect(item.getTextContent()).toBe("foo");
    });
  });

  // The plugin is gated on `parentList.getListType() === "bullet"`, so typing
  // `[ ] ` inside an ORDERED list item must NOT convert — the marker stays as
  // literal text. Without this guard the ordered item would silently flip to a
  // check item, but the saved file would still read as ordered (the file
  // round-trips `1. ` differently), drifting the editor's rendering away from
  // the on-disk content.
  //
  // Before:
  //   |
  //
  // After typing `1. [ ] foo`:
  //   1. [ ] foo|        (ordered list, item text "[ ] foo", no convert)
  test("`1. [ ] foo` typed leaves the ordered item with literal `[ ] foo` text (no convert)", async () => {
    const { editor, screen, user } = await renderTestEditor({
      plugins: (
        <>
          <ListPlugin />
          <MarkdownShortcutPlugin transformers={MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS} />
          <CheckListShortcutPlugin />
        </>
      ),
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);
    await user.keyboard("1. [[ ] foo");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const list = root.getFirstChild();
      if (!$isListNode(list)) throw new Error("expected ListNode at root[0]");
      expect(list.getListType()).toBe("number");
      expect(list.getChildrenSize()).toBe(1);

      const item = list.getFirstChild();
      if (!$isListItemNode(item)) throw new Error("expected ListItemNode at list[0]");
      expect(item.getTextContent()).toBe("[ ] foo");
    });
  });
});
