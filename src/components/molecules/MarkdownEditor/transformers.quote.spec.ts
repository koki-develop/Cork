import { $isQuoteNode } from "@lexical/rich-text";
import { $getRoot, $isParagraphNode, $isTextNode } from "lexical";
import { describe, expect, test } from "vitest";

import { $readMarkdown, $setMarkdown, createTestHeadlessEditor } from "./__tests__/utils";

// Cork's custom QUOTE transformer extends `@lexical/markdown` to handle
// `> >` nested blockquotes — the upstream transformer flattens depth-2+ on
// import. This is the most fragile transformer in the bundle; recent reviews
// surfaced multiple round-trip bugs along this path.
describe("Cork QUOTE transformer", () => {
  test("a depth-2 nested blockquote round-trips identically", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "> > Hello");
    expect($readMarkdown(editor)).toBe("> > Hello");
  });

  // Asserts the depth-2 tree shape, not just textContent. Both `> Hello`
  // and `> > Hello` produce textContent "Hello", so a string-only assertion
  // would let a flatten-on-import regression slip through.
  test("imports `> > Hello` as a depth-2 QuoteNode tree", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "> > Hello");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const outer = root.getFirstChild();
      if (!$isQuoteNode(outer)) {
        throw new Error("expected outer QuoteNode at root[0]");
      }
      expect(outer.getChildrenSize()).toBe(1);

      const inner = outer.getFirstChild();
      if (!$isQuoteNode(inner)) {
        throw new Error("expected inner QuoteNode inside outer quote");
      }
      expect(inner.getChildrenSize()).toBe(1);

      const paragraph = inner.getFirstChild();
      if (!$isParagraphNode(paragraph)) {
        throw new Error("expected ParagraphNode inside inner quote");
      }

      const text = paragraph.getFirstChild();
      if (!$isTextNode(text)) {
        throw new Error("expected TextNode inside paragraph");
      }
      expect(text.getTextContent()).toBe("Hello");
    });
  });
});
