import { $createCodeNode, $isCodeNode } from "@lexical/code";
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
import { CodeBlockEscapePlugin } from "./CodeBlockEscapePlugin";

describe("CodeBlockEscapePlugin — top-level (no enclosing quote)", () => {
  test("ArrowUp at the first line of the document's first code block inserts an empty paragraph before it", async () => {
    const { editor } = await renderTestEditor({ plugins: <CodeBlockEscapePlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("aaa"));
        root.append(codeNode);
        codeNode.selectEnd();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "ArrowUp");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(2);
      const first = root.getFirstChild();
      if (!$isParagraphNode(first)) throw new Error("expected an empty ParagraphNode at root[0]");
      expect(first.getTextContent()).toBe("");
      expect($isCodeNode(root.getChildAtIndex(1))).toBe(true);
    });
  });

  test("ArrowDown at the last line of the document's last code block inserts an empty paragraph after it", async () => {
    const { editor } = await renderTestEditor({ plugins: <CodeBlockEscapePlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("aaa"));
        root.append(codeNode);
        codeNode.selectEnd();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "ArrowDown");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(2);
      expect($isCodeNode(root.getFirstChild())).toBe(true);
      const last = root.getChildAtIndex(1);
      if (!$isParagraphNode(last)) throw new Error("expected an empty ParagraphNode at root[1]");
      expect(last.getTextContent()).toBe("");
    });
  });

  test("ArrowDown does not escape when a sibling block already follows", async () => {
    const { editor } = await renderTestEditor({ plugins: <CodeBlockEscapePlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("aaa"));
        root.append(codeNode);
        const after = $createParagraphNode();
        after.append($createTextNode("bbb"));
        root.append(after);
        codeNode.selectEnd();
      },
      { discrete: true },
    );

    const handled = dispatchKeyDown(editor, "ArrowDown");
    expect(handled).toBe(false);

    editor.getEditorState().read(() => {
      // No new paragraph was inserted — still exactly the two original blocks.
      expect($getRoot().getChildrenSize()).toBe(2);
    });
  });

  test("Shift+Enter anywhere in the block inserts a paragraph right after it", async () => {
    const { editor } = await renderTestEditor({ plugins: <CodeBlockEscapePlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("aaa"));
        root.append(codeNode);
        codeNode.selectStart();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Enter", { shiftKey: true });

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(2);
      expect($isCodeNode(root.getFirstChild())).toBe(true);
      const last = root.getChildAtIndex(1);
      if (!$isParagraphNode(last)) throw new Error("expected an empty ParagraphNode at root[1]");
    });
  });
});

// A fenced code block can now be nested inside a blockquote (QUOTE_CODE /
// QuoteCodeShortcutPlugin). Arrow-key escape at the edge of such a block
// must exit the QUOTE too — not park the new paragraph as just another
// quoted line one level in, which would leave the caret oddly still
// indented after "leaving" the code block. Shift+Enter (and vanilla
// Lexical's own two-blank-trailing-lines-then-Enter exit) are UNCHANGED:
// they land as a sibling inside the block's immediate parent, same as
// before nesting existed.
describe("CodeBlockEscapePlugin — code block nested inside a quote", () => {
  // Before:
  //   > ```
  //   > aaa|
  //   > ```
  // ArrowDown
  // To-Be:
  //   > ```
  //   > aaa
  //   > ```
  //   |
  test("ArrowDown at the last line of a quote's only child exits the quote entirely", async () => {
    const { editor } = await renderTestEditor({ plugins: <CodeBlockEscapePlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const quote = $createQuoteNode();
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("aaa"));
        quote.append(codeNode);
        root.append(quote);
        codeNode.selectEnd();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "ArrowDown");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(2);

      const quote = root.getFirstChild();
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      expect(quote.getChildrenSize()).toBe(1);
      expect($isCodeNode(quote.getFirstChild())).toBe(true);

      // The new paragraph is a ROOT sibling — unindented, outside the quote.
      const exit = root.getChildAtIndex(1);
      if (!$isParagraphNode(exit)) throw new Error("expected an empty ParagraphNode at root[1]");
      expect(exit.getTextContent()).toBe("");
    });
  });

  // Before:
  //   > ```
  //   > aaa|
  //   > ```
  // ArrowUp
  // To-Be:
  //   |
  //   > ```
  //   > aaa
  //   > ```
  test("ArrowUp at the first line of a quote's only child exits the quote entirely", async () => {
    const { editor } = await renderTestEditor({ plugins: <CodeBlockEscapePlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const quote = $createQuoteNode();
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("aaa"));
        quote.append(codeNode);
        root.append(quote);
        codeNode.selectEnd();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "ArrowUp");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(2);

      // The new paragraph is a ROOT sibling BEFORE the quote — unindented.
      const exit = root.getFirstChild();
      if (!$isParagraphNode(exit)) throw new Error("expected an empty ParagraphNode at root[0]");
      expect(exit.getTextContent()).toBe("");

      const quote = root.getChildAtIndex(1);
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[1]");
      expect(quote.getChildrenSize()).toBe(1);
      expect($isCodeNode(quote.getFirstChild())).toBe(true);
    });
  });

  test("ArrowDown exits ALL levels of nesting for a code block that is last-child all the way up", async () => {
    const { editor } = await renderTestEditor({ plugins: <CodeBlockEscapePlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const outer = $createQuoteNode();
        const inner = $createQuoteNode();
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("aaa"));
        inner.append(codeNode);
        outer.append(inner);
        root.append(outer);
        codeNode.selectEnd();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "ArrowDown");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(2);

      const outer = root.getFirstChild();
      if (!$isQuoteNode(outer)) throw new Error("expected outer QuoteNode at root[0]");
      const inner = outer.getFirstChild();
      if (!$isQuoteNode(inner)) throw new Error("expected inner QuoteNode");
      expect($isCodeNode(inner.getFirstChild())).toBe(true);

      // Escaped past BOTH quote levels — the exit paragraph is a root
      // sibling of the OUTER quote, not merely the inner one.
      const exit = root.getChildAtIndex(1);
      if (!$isParagraphNode(exit)) throw new Error("expected an empty ParagraphNode at root[1]");
    });
  });

  // Mirror of the above for ArrowUp.
  test("ArrowUp exits ALL levels of nesting for a code block that is first-child all the way up", async () => {
    const { editor } = await renderTestEditor({ plugins: <CodeBlockEscapePlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const outer = $createQuoteNode();
        const inner = $createQuoteNode();
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("aaa"));
        inner.append(codeNode);
        outer.append(inner);
        root.append(outer);
        codeNode.selectEnd();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "ArrowUp");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(2);

      // Escaped past BOTH quote levels — the exit paragraph is a root
      // sibling BEFORE the OUTER quote, not merely the inner one.
      const exit = root.getFirstChild();
      if (!$isParagraphNode(exit)) throw new Error("expected an empty ParagraphNode at root[0]");

      const outer = root.getChildAtIndex(1);
      if (!$isQuoteNode(outer)) throw new Error("expected outer QuoteNode at root[1]");
      const inner = outer.getFirstChild();
      if (!$isQuoteNode(inner)) throw new Error("expected inner QuoteNode");
      expect($isCodeNode(inner.getFirstChild())).toBe(true);
    });
  });

  // The escalation must stop at whichever level FIRST has a sibling —
  // here the code block is last in the INNER quote, but the inner quote
  // itself is NOT last inside the outer quote (another quoted paragraph
  // follows it one level out). ArrowDown should land in that quoted
  // paragraph — still one level of `>` deep — rather than either stopping
  // short (no-op) or over-escalating all the way past the outer quote too.
  test("ArrowDown stops escalating at the first quote level that already has a sibling", async () => {
    const { editor, screen, user } = await renderTestEditor({ plugins: <CodeBlockEscapePlugin /> });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const outer = $createQuoteNode();
        const inner = $createQuoteNode();
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("aaa"));
        inner.append(codeNode);
        outer.append(inner);
        const ccc = $createParagraphNode();
        ccc.append($createTextNode("ccc"));
        outer.append(ccc);
        root.append(outer);
        codeNode.selectEnd();
      },
      { discrete: true },
    );

    await user.keyboard("{ArrowDown}");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      // No new paragraph anywhere — still exactly one root-level QuoteNode.
      expect(root.getChildrenSize()).toBe(1);

      const outer = root.getFirstChild();
      if (!$isQuoteNode(outer)) throw new Error("expected outer QuoteNode at root[0]");
      expect(outer.getChildrenSize()).toBe(2);

      const inner = outer.getFirstChild();
      if (!$isQuoteNode(inner)) throw new Error("expected inner QuoteNode at outer[0]");
      expect($isCodeNode(inner.getFirstChild())).toBe(true);

      const ccc = outer.getChildAtIndex(1);
      if (!$isParagraphNode(ccc)) throw new Error("expected ParagraphNode at outer[1]");
      expect(ccc.getTextContent()).toBe("ccc");

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      const anchor = selection.anchor.getNode();
      const anchorParagraph = $isParagraphNode(anchor) ? anchor : anchor.getParent();
      expect(anchorParagraph?.getKey()).toBe(ccc.getKey());
    });
  });

  // Symmetric to the previous case for ArrowUp: the inner quote is NOT
  // first inside the outer quote (another quoted paragraph precedes it),
  // so escalation stops at the inner level and ArrowUp lands there.
  test("ArrowUp stops escalating at the first quote level that already has a sibling", async () => {
    const { editor, screen, user } = await renderTestEditor({ plugins: <CodeBlockEscapePlugin /> });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const outer = $createQuoteNode();
        const ccc = $createParagraphNode();
        ccc.append($createTextNode("ccc"));
        outer.append(ccc);
        const inner = $createQuoteNode();
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("aaa"));
        inner.append(codeNode);
        outer.append(inner);
        root.append(outer);
        codeNode.selectEnd();
      },
      { discrete: true },
    );

    await user.keyboard("{ArrowUp}");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const outer = root.getFirstChild();
      if (!$isQuoteNode(outer)) throw new Error("expected outer QuoteNode at root[0]");
      expect(outer.getChildrenSize()).toBe(2);

      const ccc = outer.getFirstChild();
      if (!$isParagraphNode(ccc)) throw new Error("expected ParagraphNode at outer[0]");
      expect(ccc.getTextContent()).toBe("ccc");

      const inner = outer.getChildAtIndex(1);
      if (!$isQuoteNode(inner)) throw new Error("expected inner QuoteNode at outer[1]");
      expect($isCodeNode(inner.getFirstChild())).toBe(true);

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      const anchor = selection.anchor.getNode();
      const anchorParagraph = $isParagraphNode(anchor) ? anchor : anchor.getParent();
      expect(anchorParagraph?.getKey()).toBe(ccc.getKey());
    });
  });

  // Full generalization of "moves into an existing paragraph instead of
  // inserting a blank one": the code block escalates past BOTH quote
  // levels (last-child all the way up), but something already follows the
  // OUTER quote at root level — ArrowDown must move into THAT rather than
  // conjuring a new blank paragraph after the outer quote.
  test("ArrowDown escalates past all quote levels and moves into an existing paragraph after the outermost quote", async () => {
    const { editor, screen, user } = await renderTestEditor({ plugins: <CodeBlockEscapePlugin /> });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const outer = $createQuoteNode();
        const inner = $createQuoteNode();
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("aaa"));
        inner.append(codeNode);
        outer.append(inner);
        root.append(outer);
        const bbb = $createParagraphNode();
        bbb.append($createTextNode("bbb"));
        root.append(bbb);
        codeNode.selectEnd();
      },
      { discrete: true },
    );

    await user.keyboard("{ArrowDown}");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      // No new paragraph was inserted — still exactly [outer QuoteNode, "bbb"].
      expect(root.getChildrenSize()).toBe(2);

      const outer = root.getFirstChild();
      if (!$isQuoteNode(outer)) throw new Error("expected outer QuoteNode at root[0]");
      const inner = outer.getFirstChild();
      if (!$isQuoteNode(inner)) throw new Error("expected inner QuoteNode");
      expect($isCodeNode(inner.getFirstChild())).toBe(true);

      const bbb = root.getChildAtIndex(1);
      if (!$isParagraphNode(bbb)) throw new Error("expected ParagraphNode at root[1]");
      expect(bbb.getTextContent()).toBe("bbb");

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      const anchor = selection.anchor.getNode();
      const anchorParagraph = $isParagraphNode(anchor) ? anchor : anchor.getParent();
      expect(anchorParagraph?.getKey()).toBe(bbb.getKey());
    });
  });

  // Symmetric to the previous case for ArrowUp.
  test("ArrowUp escalates past all quote levels and moves into an existing paragraph before the outermost quote", async () => {
    const { editor, screen, user } = await renderTestEditor({ plugins: <CodeBlockEscapePlugin /> });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const bbb = $createParagraphNode();
        bbb.append($createTextNode("bbb"));
        root.append(bbb);
        const outer = $createQuoteNode();
        const inner = $createQuoteNode();
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("aaa"));
        inner.append(codeNode);
        outer.append(inner);
        root.append(outer);
        codeNode.selectEnd();
      },
      { discrete: true },
    );

    await user.keyboard("{ArrowUp}");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      // No new paragraph was inserted — still exactly ["bbb", outer QuoteNode].
      expect(root.getChildrenSize()).toBe(2);

      const bbb = root.getFirstChild();
      if (!$isParagraphNode(bbb)) throw new Error("expected ParagraphNode at root[0]");
      expect(bbb.getTextContent()).toBe("bbb");

      const outer = root.getChildAtIndex(1);
      if (!$isQuoteNode(outer)) throw new Error("expected outer QuoteNode at root[1]");
      const inner = outer.getFirstChild();
      if (!$isQuoteNode(inner)) throw new Error("expected inner QuoteNode");
      expect($isCodeNode(inner.getFirstChild())).toBe(true);

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      const anchor = selection.anchor.getNode();
      const anchorParagraph = $isParagraphNode(anchor) ? anchor : anchor.getParent();
      expect(anchorParagraph?.getKey()).toBe(bbb.getKey());
    });
  });

  test("ArrowDown does not escape when another quoted line already follows the code block", async () => {
    const { editor } = await renderTestEditor({ plugins: <CodeBlockEscapePlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const quote = $createQuoteNode();
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("aaa"));
        quote.append(codeNode);
        const after = $createParagraphNode();
        after.append($createTextNode("bbb"));
        quote.append(after);
        root.append(quote);
        codeNode.selectEnd();
      },
      { discrete: true },
    );

    const handled = dispatchKeyDown(editor, "ArrowDown");
    expect(handled).toBe(false);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);
      const quote = root.getFirstChild();
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      // No new paragraph was inserted — still exactly the two original quote children.
      expect(quote.getChildrenSize()).toBe(2);
    });
  });

  // Regression: the escalating walk used to insert a new blank paragraph
  // unconditionally once it reached the outermost quote level, even when
  // something ELSE already followed the quote there — leaving an unwanted
  // extra blank line between the quote and the existing next block instead
  // of just moving the caret into it. Only the true edge of the whole
  // document body should conjure a new paragraph; otherwise the plugin must
  // step aside and let the browser's own native ArrowDown reach the
  // existing content, exactly like the non-nested case already did.
  //
  // Before:
  //   > ```
  //   > aaa|
  //   > ```
  //
  //   bbb
  // ArrowDown
  // As-Is (bug): a new blank paragraph is inserted between the quote and
  // `bbb`. To-Be: no new paragraph — the caret simply moves into `bbb`.
  test("ArrowDown moves into an existing paragraph AFTER the quote instead of inserting a blank one", async () => {
    const { editor, screen, user } = await renderTestEditor({ plugins: <CodeBlockEscapePlugin /> });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const quote = $createQuoteNode();
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("aaa"));
        quote.append(codeNode);
        root.append(quote);
        const bbb = $createParagraphNode();
        bbb.append($createTextNode("bbb"));
        root.append(bbb);
        codeNode.selectEnd();
      },
      { discrete: true },
    );

    await user.keyboard("{ArrowDown}");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      // No new paragraph was inserted — still exactly [QuoteNode, "bbb"].
      expect(root.getChildrenSize()).toBe(2);
      const bbb = root.getChildAtIndex(1);
      if (!$isParagraphNode(bbb)) throw new Error("expected ParagraphNode at root[1]");
      expect(bbb.getTextContent()).toBe("bbb");

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      const anchor = selection.anchor.getNode();
      const anchorParagraph = $isParagraphNode(anchor) ? anchor : anchor.getParent();
      expect(anchorParagraph?.getKey()).toBe(bbb.getKey());
    });
  });

  // Mirror of the above for ArrowUp: a paragraph already preceding the quote
  // means arrowing up from the quote's first line should move into it, not
  // insert a new blank paragraph before the quote.
  //
  // Before:
  //   bbb
  //
  //   > ```
  //   > aaa|
  //   > ```
  // ArrowUp
  // As-Is (bug): a new blank paragraph is inserted between `bbb` and the
  // quote. To-Be: no new paragraph — the caret simply moves into `bbb`.
  test("ArrowUp moves into an existing paragraph BEFORE the quote instead of inserting a blank one", async () => {
    const { editor, screen, user } = await renderTestEditor({ plugins: <CodeBlockEscapePlugin /> });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const bbb = $createParagraphNode();
        bbb.append($createTextNode("bbb"));
        root.append(bbb);
        const quote = $createQuoteNode();
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("aaa"));
        quote.append(codeNode);
        root.append(quote);
        codeNode.selectEnd();
      },
      { discrete: true },
    );

    await user.keyboard("{ArrowUp}");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      // No new paragraph was inserted — still exactly ["bbb", QuoteNode].
      expect(root.getChildrenSize()).toBe(2);
      const bbb = root.getFirstChild();
      if (!$isParagraphNode(bbb)) throw new Error("expected ParagraphNode at root[0]");
      expect(bbb.getTextContent()).toBe("bbb");

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      const anchor = selection.anchor.getNode();
      const anchorParagraph = $isParagraphNode(anchor) ? anchor : anchor.getParent();
      expect(anchorParagraph?.getKey()).toBe(bbb.getKey());
    });
  });

  // Shift+Enter is a faster version of vanilla Lexical's own trailing-Enter
  // exit (see the plugin header) — BOTH stay inside whatever the code block
  // was nested in, unlike the arrow-key escape above. Locking in current,
  // already-correct behavior.
  //
  // Before:
  //   > ```
  //   > aaa|
  //   > ```
  // Shift+Enter
  // As-Is & To-Be:
  //   > ```
  //   > aaa
  //   > ```
  //   > |
  test("Shift+Enter on a quote-nested code block stays inside the quote", async () => {
    const { editor } = await renderTestEditor({ plugins: <CodeBlockEscapePlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const quote = $createQuoteNode();
        const codeNode = $createCodeNode();
        codeNode.append($createTextNode("aaa"));
        quote.append(codeNode);
        root.append(quote);
        codeNode.selectEnd();
      },
      { discrete: true },
    );

    dispatchKeyDown(editor, "Enter", { shiftKey: true });

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const quote = root.getFirstChild();
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      expect(quote.getChildrenSize()).toBe(2);
      expect($isCodeNode(quote.getFirstChild())).toBe(true);

      const exit = quote.getChildAtIndex(1);
      if (!$isParagraphNode(exit)) throw new Error("expected an empty ParagraphNode at quote[1]");
      expect(exit.getTextContent()).toBe("");
    });
  });

  // Vanilla Lexical's OWN exit mechanic (unrelated to this plugin — CodeNode
  // itself inserts a sibling paragraph once Enter is pressed on two already-
  // blank trailing lines) must ALSO stay inside the quote, not escalate.
  // Real typed keystrokes (not the synthetic command dispatch used above)
  // since this exercises Lexical core's own multi-keystroke state tracking,
  // not a single command this plugin owns.
  //
  // Before:
  //   > ```
  //   > aaa|
  //   > ```
  // Enter, Enter, Enter (two blank lines, then the exiting third)
  // As-Is & To-Be:
  //   > ```
  //   > aaa
  //   >
  //   >
  //   > ```
  //   > |
  test("pressing Enter three times at the end of a quote-nested code block's content stays inside the quote", async () => {
    const { editor, screen, user } = await renderTestEditor({
      initialValue: "> ```\n> aaa\n> ```",
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const quote = $getRoot().getFirstChild();
        if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
        const codeNode = quote.getFirstChild();
        if (!$isCodeNode(codeNode)) throw new Error("expected CodeNode inside the quote");
        codeNode.selectEnd();
      },
      { discrete: true },
    );

    await user.keyboard("{Enter}{Enter}{Enter}");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const quote = root.getFirstChild();
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      expect(quote.getChildrenSize()).toBe(2);
      expect($isCodeNode(quote.getFirstChild())).toBe(true);

      const exit = quote.getChildAtIndex(1);
      if (!$isParagraphNode(exit)) throw new Error("expected an empty ParagraphNode at quote[1]");
      expect(exit.getTextContent()).toBe("");
    });
  });
});
