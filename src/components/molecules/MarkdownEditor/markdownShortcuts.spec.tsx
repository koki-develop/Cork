import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { $isQuoteNode } from "@lexical/rich-text";
import { $getRoot, $getSelection, $isParagraphNode, $isRangeSelection, $isTextNode } from "lexical";
import { describe, expect, test } from "vitest";

import { renderTestEditor } from "./__tests__/utils";
import { MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS } from "./transformers";

describe("Markdown shortcuts (live typing)", () => {
  // Type `# Hello` on an empty line — the live shortcut promotes the paragraph
  // to a heading. Asserts the rendered DOM is exactly `<h1>Hello</h1>`.
  //
  // Before:
  //   |
  //
  // After typing `# Hello`:
  //   # Hello|        (rendered <h1>Hello</h1>)
  test("`# ` at the start of a paragraph renders the line as <h1>", async () => {
    const { screen, user } = await renderTestEditor({
      plugins: <MarkdownShortcutPlugin transformers={MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS} />,
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);
    await user.keyboard("# Hello");

    await expect.element(textbox.getByRole("heading", { level: 1 })).toBeVisible();
    const editorRoot = textbox.element();
    expect(editorRoot.children).toHaveLength(1);
    const heading = editorRoot.firstElementChild;
    expect(heading?.tagName).toBe("H1");
    expect(heading?.textContent).toBe("Hello");
  });

  // Production "open a saved `> aaa\n\n> ccc` task" lands two adjacent
  // QuoteNodes with a spacer paragraph between them (restored by
  // `$insertSpacersBetweenAdjacentQuotes` on initial load). Typing `> ` on the
  // spacer triggers the QUOTE shortcut, which prev-merges into the leading
  // QuoteNode AND absorbs the trailing one (`$absorbTrailingQuoteSibling`) —
  // all three lines collapse into one quote, and the typed `bbb` lands on the
  // new middle line.
  //
  // Before:
  //   > aaa
  //   |
  //   > ccc
  //
  // After typing `> bbb`:
  //   > aaa
  //   > bbb|
  //   > ccc
  test("typing `> bbb` on the spacer between two adjacent QuoteNodes merges all three lines", async () => {
    const { editor, screen, user } = await renderTestEditor({
      initialValue: "> aaa\n\n> ccc",
      plugins: <MarkdownShortcutPlugin transformers={MARKDOWN_BLOCK_SHORTCUT_TRANSFORMERS} />,
    });

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(3);
      expect($isQuoteNode(root.getChildAtIndex(0))).toBe(true);
      expect($isParagraphNode(root.getChildAtIndex(1))).toBe(true);
      expect($isQuoteNode(root.getChildAtIndex(2))).toBe(true);
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const root = $getRoot();
        const spacer = root.getChildAtIndex(1);
        if (!$isParagraphNode(spacer)) throw new Error("expected ParagraphNode at root[1]");
        spacer.selectStart();
      },
      { discrete: true },
    );

    await user.keyboard("> bbb");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const quote = root.getFirstChild();
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      expect(quote.getChildrenSize()).toBe(3);

      const leadingLine = quote.getChildAtIndex(0);
      if (!$isParagraphNode(leadingLine)) throw new Error("expected ParagraphNode at quote[0]");
      expect(leadingLine.getTextContent()).toBe("aaa");

      const middleLine = quote.getChildAtIndex(1);
      if (!$isParagraphNode(middleLine)) throw new Error("expected ParagraphNode at quote[1]");
      expect(middleLine.getTextContent()).toBe("bbb");

      const trailingLine = quote.getChildAtIndex(2);
      if (!$isParagraphNode(trailingLine)) throw new Error("expected ParagraphNode at quote[2]");
      expect(trailingLine.getTextContent()).toBe("ccc");

      // After typing `bbb` into the freshly-merged middle paragraph, the cursor
      // sits at offset 3 of the TextNode "bbb" (end of the typed run).
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      expect(selection.isCollapsed()).toBe(true);
      const anchor = selection.anchor.getNode();
      if (!$isTextNode(anchor)) throw new Error("expected TextNode anchor");
      expect(anchor.getTextContent()).toBe("bbb");
      expect(anchor.getParent()?.getKey()).toBe(middleLine.getKey());
      expect(selection.anchor.offset).toBe(3);
    });
  });
});
