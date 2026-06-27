import { $createQuoteNode, $isQuoteNode } from "@lexical/rich-text";
import { $createParagraphNode, $getRoot, $isParagraphNode } from "lexical";
import { describe, expect, test } from "vitest";

import { dispatchKeyDown, renderTestEditor } from "./__tests__/utils";
import { QuoteExitPlugin } from "./QuoteExitPlugin";

// UX contract: Backspace at the start of an empty single-paragraph QuoteNode
// unwraps the quote (paragraph escapes to root, the now-empty quote is
// pruned). Without this, typing `> ` and immediately pressing Backspace
// traps the user in an empty quote.
describe("QuoteExitPlugin", () => {
  test("Backspace at the start of an empty single-paragraph QuoteNode unwraps the quote", async () => {
    const { editor } = await renderTestEditor({ plugins: <QuoteExitPlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const quote = $createQuoteNode();
        const paragraph = $createParagraphNode();
        quote.append(paragraph);
        root.append(quote);
        paragraph.selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Backspace");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const child = root.getFirstChild();
      expect($isParagraphNode(child)).toBe(true);
      expect($isQuoteNode(child)).toBe(false);
    });
  });
});
