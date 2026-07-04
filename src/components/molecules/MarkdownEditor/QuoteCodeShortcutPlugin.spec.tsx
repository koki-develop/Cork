import { $isCodeNode } from "@lexical/code";
import { $isQuoteNode } from "@lexical/rich-text";
import { $createParagraphNode, $getRoot, $isParagraphNode } from "lexical";
import { describe, expect, test } from "vitest";

import { $readMarkdown, renderTestEditor } from "./__tests__/utils";
import { QuoteCodeShortcutPlugin } from "./QuoteCodeShortcutPlugin";

describe("QuoteCodeShortcutPlugin (live typing)", () => {
  // Production "open `> aaa`, press Enter to start a new quote line, type
  // ``` js" should convert that new line into a real CodeNode nested inside
  // the SAME QuoteNode — without this plugin, `@lexical/markdown`'s own CODE
  // shortcut never reaches it (`runMultilineElementTransformers` requires the
  // edited paragraph's own parent to be the document root, which a QuoteNode
  // never is). The Enter-exit step itself is out of scope here (QuoteExitPlugin
  // owns that) — the trailing paragraph is built directly so this test
  // isolates the plugin under test.
  test("typing ``` followed by a space on a paragraph inside a quote converts it to a nested CodeNode", async () => {
    const { editor, screen, user } = await renderTestEditor({
      initialValue: "> aaa",
      plugins: <QuoteCodeShortcutPlugin />,
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const root = $getRoot();
        const quote = root.getFirstChild();
        if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
        const trailing = $createParagraphNode();
        quote.append(trailing);
        trailing.selectStart();
      },
      { discrete: true },
    );

    await user.keyboard("```js ");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const quote = root.getFirstChild();
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      expect(quote.getChildrenSize()).toBe(2);

      const aaa = quote.getChildAtIndex(0);
      if (!$isParagraphNode(aaa)) throw new Error("expected ParagraphNode at quote[0]");
      expect(aaa.getTextContent()).toBe("aaa");

      const codeNode = quote.getChildAtIndex(1);
      if (!$isCodeNode(codeNode)) throw new Error("expected CodeNode at quote[1]");
      expect(codeNode.getLanguage()).toBe("js");
      expect(codeNode.getTextContent()).toBe("");
    });
  });

  test("typing ``` with no language still converts on a trailing space, with an unset language", async () => {
    const { editor, screen, user } = await renderTestEditor({
      initialValue: "> aaa",
      plugins: <QuoteCodeShortcutPlugin />,
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const quote = $getRoot().getFirstChild();
        if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
        const trailing = $createParagraphNode();
        quote.append(trailing);
        trailing.selectStart();
      },
      { discrete: true },
    );

    await user.keyboard("``` ");

    editor.getEditorState().read(() => {
      const quote = $getRoot().getFirstChild();
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      const codeNode = quote.getChildAtIndex(1);
      if (!$isCodeNode(codeNode)) throw new Error("expected CodeNode at quote[1]");
      expect(codeNode.getLanguage()).toBeUndefined();
    });
  });

  test("converts in place inside a depth-2 nested quote", async () => {
    const { editor, screen, user } = await renderTestEditor({
      initialValue: "> > aaa",
      plugins: <QuoteCodeShortcutPlugin />,
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const outer = $getRoot().getFirstChild();
        if (!$isQuoteNode(outer)) throw new Error("expected outer QuoteNode at root[0]");
        const inner = outer.getFirstChild();
        if (!$isQuoteNode(inner)) throw new Error("expected inner QuoteNode");
        const trailing = $createParagraphNode();
        inner.append(trailing);
        trailing.selectStart();
      },
      { discrete: true },
    );

    await user.keyboard("```py ");

    editor.getEditorState().read(() => {
      const outer = $getRoot().getFirstChild();
      if (!$isQuoteNode(outer)) throw new Error("expected outer QuoteNode at root[0]");
      const inner = outer.getFirstChild();
      if (!$isQuoteNode(inner)) throw new Error("expected inner QuoteNode");
      expect(inner.getChildrenSize()).toBe(2);

      const codeNode = inner.getChildAtIndex(1);
      if (!$isCodeNode(codeNode)) throw new Error("expected CodeNode at inner[1]");
      expect(codeNode.getLanguage()).toBe("py");
    });
  });

  // Without an enclosing QuoteNode this plugin must stay out of the way —
  // that shortcut belongs to upstream's own root-level CODE transformer
  // (wired through MarkdownShortcutPlugin in production, not mounted here).
  test("does not fire for a fence-shaped paragraph with no enclosing quote", async () => {
    const { editor, screen, user } = await renderTestEditor({
      plugins: <QuoteCodeShortcutPlugin />,
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);
    await user.keyboard("```js ");

    editor.getEditorState().read(() => {
      const first = $getRoot().getFirstChild();
      expect($isCodeNode(first)).toBe(false);
    });
  });

  // Regression: the created CodeNode originally never received the typed
  // fence width — `corkCodeFenceState`'s parser default silently normalized
  // any widened fence back down to 3 backticks on save, out of step with
  // QUOTE_CODE's own file-load path (which does preserve it).
  test("typing a widened (4-backtick) fence preserves that width on save", async () => {
    const { editor, screen, user } = await renderTestEditor({
      initialValue: "> aaa",
      plugins: <QuoteCodeShortcutPlugin />,
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const quote = $getRoot().getFirstChild();
        if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
        const trailing = $createParagraphNode();
        quote.append(trailing);
        trailing.selectStart();
      },
      { discrete: true },
    );

    await user.keyboard("````js ");

    expect($readMarkdown(editor)).toBe("> aaa\n> ````js\n> ````");
  });

  // Regression (reported bug): the far more natural gesture — type the
  // fence, then press Enter, with NO trailing space typed first — never
  // converted at all. `@lexical/markdown`'s own root-level CODE shortcut
  // supports exactly this gesture via a SEPARATE Enter-triggered path inside
  // upstream's `registerMarkdownShortcuts` (`runMultilineElementTransformers`
  // called with `triggerOnEnter: true`, which skips the trailing-space gate
  // entirely) — but that path shares the same root-parent-only restriction,
  // so it never reached a quote-nested paragraph either. Without a dedicated
  // Enter handler here, a fence typed inside a quote and immediately
  // followed by Enter stayed literal text forever, and saving the file
  // round-tripped it as escaped backtick text (` \`\`\` `) instead of a real
  // fenced code block.
  describe("Enter (no trailing space) trigger", () => {
    test("typing ``` then pressing Enter converts to a nested CodeNode", async () => {
      const { editor, screen, user } = await renderTestEditor({
        initialValue: "> aaa",
        plugins: <QuoteCodeShortcutPlugin />,
      });

      const textbox = screen.getByRole("textbox");
      await user.click(textbox);

      editor.update(
        () => {
          const quote = $getRoot().getFirstChild();
          if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
          const trailing = $createParagraphNode();
          quote.append(trailing);
          trailing.selectStart();
        },
        { discrete: true },
      );

      await user.keyboard("```{Enter}");

      editor.getEditorState().read(() => {
        const quote = $getRoot().getFirstChild();
        if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
        expect(quote.getChildrenSize()).toBe(2);

        const codeNode = quote.getChildAtIndex(1);
        if (!$isCodeNode(codeNode)) throw new Error("expected CodeNode at quote[1]");
        expect(codeNode.getLanguage()).toBeUndefined();
        expect(codeNode.getTextContent()).toBe("");
      });
    });

    test("typing ```js then pressing Enter converts with the language preserved", async () => {
      const { editor, screen, user } = await renderTestEditor({
        initialValue: "> aaa",
        plugins: <QuoteCodeShortcutPlugin />,
      });

      const textbox = screen.getByRole("textbox");
      await user.click(textbox);

      editor.update(
        () => {
          const quote = $getRoot().getFirstChild();
          if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
          const trailing = $createParagraphNode();
          quote.append(trailing);
          trailing.selectStart();
        },
        { discrete: true },
      );

      await user.keyboard("```js{Enter}");

      editor.getEditorState().read(() => {
        const quote = $getRoot().getFirstChild();
        if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
        const codeNode = quote.getChildAtIndex(1);
        if (!$isCodeNode(codeNode)) throw new Error("expected CodeNode at quote[1]");
        expect(codeNode.getLanguage()).toBe("js");
      });
    });

    // End-to-end reproduction of the reported bug: fence + Enter, then real
    // code content typed into the now-real CodeNode, saved back out as a
    // proper fenced block rather than escaped literal quote text.
    test("full gesture: fence + Enter + typed code content round-trips as a real fenced block", async () => {
      const { editor, screen, user } = await renderTestEditor({
        initialValue: "> aaa",
        plugins: <QuoteCodeShortcutPlugin />,
      });

      const textbox = screen.getByRole("textbox");
      await user.click(textbox);

      editor.update(
        () => {
          const quote = $getRoot().getFirstChild();
          if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
          const trailing = $createParagraphNode();
          quote.append(trailing);
          trailing.selectStart();
        },
        { discrete: true },
      );

      await user.keyboard("```js{Enter}hoge");

      expect($readMarkdown(editor)).toBe("> aaa\n> ```js\n> hoge\n> ```");
    });

    // Enter still exits the quote/splits the paragraph normally when the
    // line ISN'T a bare fence marker — this plugin must not hijack every
    // Enter press inside a quote.
    test("does not fire on Enter for ordinary quote text", async () => {
      const { editor, screen, user } = await renderTestEditor({
        initialValue: "> aaa",
        plugins: <QuoteCodeShortcutPlugin />,
      });

      const textbox = screen.getByRole("textbox");
      await user.click(textbox);
      await user.keyboard("{End}{Enter}bbb");

      editor.getEditorState().read(() => {
        const quote = $getRoot().getFirstChild();
        if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
        for (const child of quote.getChildren()) {
          expect($isCodeNode(child)).toBe(false);
        }
      });
    });

    // Outside any quote, Enter after a bare fence belongs to upstream's own
    // root-level CODE shortcut (via MarkdownShortcutPlugin in production,
    // not mounted here) — this plugin must not double-fire.
    test("does not fire on Enter for a fence-shaped paragraph with no enclosing quote", async () => {
      const { editor, screen, user } = await renderTestEditor({
        plugins: <QuoteCodeShortcutPlugin />,
      });

      const textbox = screen.getByRole("textbox");
      await user.click(textbox);
      await user.keyboard("```js{Enter}");

      editor.getEditorState().read(() => {
        const first = $getRoot().getFirstChild();
        expect($isCodeNode(first)).toBe(false);
      });
    });
  });
});
