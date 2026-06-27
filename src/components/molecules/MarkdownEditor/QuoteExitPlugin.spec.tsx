import { $createQuoteNode, $isQuoteNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
} from "lexical";
import { describe, expect, test } from "vitest";

import { dispatchKeyDown, renderTestEditor } from "./__tests__/utils";
import { QuoteExitPlugin } from "./QuoteExitPlugin";

describe("QuoteExitPlugin", () => {
  // Enter on a non-empty quote line stays in the quote (the new paragraph
  // is a sibling INSIDE the QuoteNode). This case isn't owned by the plugin
  // — it falls out of the QUOTE transformer's `Quote > Paragraph > inline`
  // tree shape — but pin it so a regression that flattens the shape (and
  // would silently disable this plugin's empty-trailing trigger) is caught.
  //
  // Before:
  //   > aaa|
  //
  // After Enter:
  //   > aaa
  //   > |
  test("Enter on a non-empty quote line appends a sibling paragraph inside the QuoteNode", async () => {
    const { editor } = await renderTestEditor({ plugins: <QuoteExitPlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const quote = $createQuoteNode();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode("aaa"));
        quote.append(paragraph);
        root.append(quote);
        paragraph.selectEnd();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Enter");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const quote = root.getFirstChild();
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      expect(quote.getChildrenSize()).toBe(2);

      const first = quote.getFirstChild();
      if (!$isParagraphNode(first)) throw new Error("expected ParagraphNode at quote[0]");
      expect(first.getTextContent()).toBe("aaa");

      const second = quote.getLastChild();
      if (!$isParagraphNode(second)) throw new Error("expected ParagraphNode at quote[1]");
      expect(second.getTextContent()).toBe("");

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      expect(selection.isCollapsed()).toBe(true);
      const anchor = selection.anchor.getNode();
      const anchorParagraph = $isParagraphNode(anchor) ? anchor : anchor.getParent();
      expect(anchorParagraph?.getKey()).toBe(second.getKey());
      expect(selection.anchor.offset).toBe(0);
    });
  });

  // Enter on an empty trailing quote line exits the quote: drop the empty
  // line, insert a fresh empty paragraph as a sibling AFTER the QuoteNode,
  // cursor parked at the new paragraph's start.
  //
  // Before:
  //   > aaa
  //   > |
  //
  // After Enter:
  //   > aaa
  //   |
  test("Enter on an empty trailing line inside a QuoteNode exits the quote downward", async () => {
    const { editor } = await renderTestEditor({ plugins: <QuoteExitPlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const quote = $createQuoteNode();
        const p1 = $createParagraphNode();
        p1.append($createTextNode("aaa"));
        const p2 = $createParagraphNode();
        quote.append(p1, p2);
        root.append(quote);
        p2.selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Enter");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(2);

      const quote = root.getFirstChild();
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      expect(quote.getChildrenSize()).toBe(1);
      const remaining = quote.getFirstChild();
      if (!$isParagraphNode(remaining)) throw new Error("expected ParagraphNode at quote[0]");
      expect(remaining.getTextContent()).toBe("aaa");

      const after = root.getLastChild();
      if (!$isParagraphNode(after)) throw new Error("expected ParagraphNode at root[1]");
      expect(after.getTextContent()).toBe("");

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      expect(selection.isCollapsed()).toBe(true);
      const anchor = selection.anchor.getNode();
      const anchorParagraph = $isParagraphNode(anchor) ? anchor : anchor.getParent();
      expect(anchorParagraph?.getKey()).toBe(after.getKey());
      expect(selection.anchor.offset).toBe(0);
    });
  });

  // Backspace on an empty single-paragraph quote unwraps to an empty
  // paragraph at root — without this, typing `> ` then Backspace traps the
  // user in an empty quote.
  //
  // Before:
  //   > |
  //
  // After Backspace:
  //   |
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
      if (!$isParagraphNode(child)) throw new Error("expected ParagraphNode at root[0]");
      expect($isQuoteNode(child)).toBe(false);
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

  // Backspace at the start of a non-empty single-paragraph quote lifts the
  // paragraph (with its content) out to root and prunes the QuoteNode.
  //
  // Before:
  //   > |aaa
  //
  // After Backspace:
  //   |aaa
  test("Backspace at the start of a non-empty single-paragraph QuoteNode unwraps the paragraph to root", async () => {
    const { editor } = await renderTestEditor({ plugins: <QuoteExitPlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const quote = $createQuoteNode();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode("aaa"));
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
      if (!$isParagraphNode(child)) throw new Error("expected ParagraphNode at root[0]");
      expect($isQuoteNode(child)).toBe(false);
      expect(child.getTextContent()).toBe("aaa");

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      expect(selection.isCollapsed()).toBe(true);
      const anchor = selection.anchor.getNode();
      const anchorParagraph = $isParagraphNode(anchor) ? anchor : anchor.getParent();
      expect(anchorParagraph?.getKey()).toBe(child.getKey());
      expect(selection.anchor.offset).toBe(0);
    });
  });

  // Backspace on an empty middle quote line extracts that paragraph to root,
  // splitting the original QuoteNode in two around the cut.
  //
  // Before:
  //   > aaa
  //   > |
  //   > bbb
  //
  // After Backspace:
  //   > aaa
  //   |
  //   > bbb
  test("Backspace at the start of an empty middle line inside a QuoteNode extracts the paragraph downward", async () => {
    const { editor } = await renderTestEditor({ plugins: <QuoteExitPlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const quote = $createQuoteNode();
        const p1 = $createParagraphNode();
        p1.append($createTextNode("aaa"));
        const p2 = $createParagraphNode();
        const p3 = $createParagraphNode();
        p3.append($createTextNode("bbb"));
        quote.append(p1, p2, p3);
        root.append(quote);
        p2.selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Backspace");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(3);

      const leadingQuote = root.getChildAtIndex(0);
      if (!$isQuoteNode(leadingQuote)) throw new Error("expected QuoteNode at root[0]");
      expect(leadingQuote.getChildrenSize()).toBe(1);
      const leadingLine = leadingQuote.getFirstChild();
      if (!$isParagraphNode(leadingLine))
        throw new Error("expected ParagraphNode at root[0]/quote[0]");
      expect(leadingLine.getTextContent()).toBe("aaa");

      const extracted = root.getChildAtIndex(1);
      if (!$isParagraphNode(extracted)) throw new Error("expected ParagraphNode at root[1]");
      expect(extracted.getTextContent()).toBe("");

      const trailingQuote = root.getChildAtIndex(2);
      if (!$isQuoteNode(trailingQuote)) throw new Error("expected QuoteNode at root[2]");
      expect(trailingQuote.getChildrenSize()).toBe(1);
      const trailingLine = trailingQuote.getFirstChild();
      if (!$isParagraphNode(trailingLine))
        throw new Error("expected ParagraphNode at root[2]/quote[0]");
      expect(trailingLine.getTextContent()).toBe("bbb");

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      expect(selection.isCollapsed()).toBe(true);
      const anchor = selection.anchor.getNode();
      const anchorParagraph = $isParagraphNode(anchor) ? anchor : anchor.getParent();
      expect(anchorParagraph?.getKey()).toBe(extracted.getKey());
      expect(selection.anchor.offset).toBe(0);
    });
  });
});
