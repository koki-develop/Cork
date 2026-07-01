import { $createCodeNode } from "@lexical/code";
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
} from "@lexical/react/LexicalHorizontalRuleNode";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
} from "lexical";
import { describe, expect, test } from "vitest";

import { dispatchKeyDown, renderTestEditor } from "./__tests__/utils";
import { CorkCodeNode } from "./CorkCodeNode";
import { HorizontalRuleKeyboardPlugin } from "./HorizontalRuleKeyboardPlugin";

// `isCaretOnEdgeLine` (the plugin's internal geometry check) now reads
// `block.getDOMSlot(blockElem).element` instead of the raw block element —
// added so a wrapper block like `CorkCodeNode` measures its inner `<code>`
// instead of the outer `<div>` (which also contains the language chip).
// `CodeNode`/`CorkCodeNode` is the only block in this editor whose top-level
// element differs from its DOM-slot element, so it's the case this plugin
// most needs coverage for — no prior spec existed for this plugin at all.
describe("HorizontalRuleKeyboardPlugin", () => {
  test("ArrowDown from the last line of a code block selects an adjacent rule", async () => {
    const { editor, screen, user } = await renderTestEditor({
      plugins: <HorizontalRuleKeyboardPlugin />,
    });

    // Click BEFORE building the tree / setting selection: a real click
    // establishes native DOM focus, which Lexical's reconciler needs before
    // it will sync a programmatic `.selectEnd()` to the native
    // `window.getSelection()` that this plugin's geometry check reads.
    // Clicking after would instead move the caret to wherever the click
    // landed, clobbering the precise position set below.
    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const code = $createCodeNode("js");
        if (!(code instanceof CorkCodeNode)) {
          throw new Error("expected CorkCodeNode from the node-replacement config");
        }
        code.append($createTextNode("hello"));
        const rule = $createHorizontalRuleNode();
        root.append(code, rule);
        code.selectEnd();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "ArrowDown");

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection)) throw new Error("expected NodeSelection");
      const root = $getRoot();
      const rule = root.getLastChild();
      if (!$isHorizontalRuleNode(rule)) throw new Error("expected HorizontalRuleNode at root end");
      expect(selection.has(rule.getKey())).toBe(true);
    });
  });

  test("ArrowUp from the first line of a paragraph selects a rule directly above", async () => {
    const { editor, screen, user } = await renderTestEditor({
      plugins: <HorizontalRuleKeyboardPlugin />,
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const rule = $createHorizontalRuleNode();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode("hello"));
        root.append(rule, paragraph);
        paragraph.selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "ArrowUp");

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection)) throw new Error("expected NodeSelection");
      const root = $getRoot();
      const rule = root.getFirstChild();
      if (!$isHorizontalRuleNode(rule))
        throw new Error("expected HorizontalRuleNode at root start");
      expect(selection.has(rule.getKey())).toBe(true);
    });
  });

  // Baseline regression guard for the code path that DOESN'T need
  // `getDOMSlot` redirection (`$isElementNode(block) ? ... : blockElem`'s
  // false branch, and the common case where a block IS its own DOM slot) —
  // makes sure the `CorkCodeNode`-motivated change didn't disturb the
  // original, still-most-common paragraph case.
  test("ArrowDown from the last line of a plain paragraph selects an adjacent rule", async () => {
    const { editor, screen, user } = await renderTestEditor({
      plugins: <HorizontalRuleKeyboardPlugin />,
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode("hello"));
        const rule = $createHorizontalRuleNode();
        root.append(paragraph, rule);
        paragraph.selectEnd();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "ArrowDown");

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection)) throw new Error("expected NodeSelection");
      const root = $getRoot();
      const rule = root.getLastChild();
      if (!$isHorizontalRuleNode(rule)) throw new Error("expected HorizontalRuleNode at root end");
      expect(selection.has(rule.getKey())).toBe(true);
    });
  });
});
