import { $createCodeNode, $isCodeNode } from "@lexical/code";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { describe, expect, test } from "vitest";

import { createTestHeadlessEditor } from "./__tests__/utils";
import { $isInsideCodeBlock } from "./codeBlock";

// `$isInsideCodeBlock` gates "is this text format-toggleable?" for the
// floating toolbar and FormatFormattableTextPlugin. A regression that returns
// false for text under a CodeNode would let users bold/italic code-block
// content and corrupt markdown round-trip on save.
describe("$isInsideCodeBlock", () => {
  test("returns false for a paragraph directly under root", () => {
    const editor = createTestHeadlessEditor();

    editor.update(
      () => {
        $getRoot().append($createParagraphNode());
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild();
      if (paragraph == null) throw new Error("paragraph not appended");
      expect($isInsideCodeBlock(paragraph)).toBe(false);
    });
  });

  test("returns true for a text node inside a CodeNode", () => {
    const editor = createTestHeadlessEditor();

    editor.update(
      () => {
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("hello"));
        $getRoot().append(codeNode);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const codeNode = $getRoot().getFirstChild();
      if (!$isCodeNode(codeNode)) throw new Error("expected CodeNode at root");
      const text = codeNode.getFirstChild();
      if (text == null) throw new Error("text not appended inside code");
      expect($isInsideCodeBlock(text)).toBe(true);
    });
  });
});
