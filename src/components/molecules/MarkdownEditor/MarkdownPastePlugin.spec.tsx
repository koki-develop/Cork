import { $createCodeNode, $isCodeNode } from "@lexical/code";
import { $isLinkNode } from "@lexical/link";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { $isQuoteNode } from "@lexical/rich-text";
import { $isTableNode } from "@lexical/table";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  type LexicalEditor,
  PASTE_COMMAND,
} from "lexical";
import { describe, expect, test } from "vitest";

import {
  $seedTableWithEmptyCell,
  buildPasteEvent,
  dispatchCommand,
  getOnlyCell,
  renderTestEditor,
} from "./__tests__/utils";
import { MarkdownPastePlugin } from "./MarkdownPastePlugin";
import { PasteLinkPlugin } from "./PasteLinkPlugin";

// Every "paste into a blank body" case needs the same scaffold: one empty
// paragraph with a collapsed caret in it. A freshly mounted editor carries NO
// selection until something focuses it, and `MarkdownPastePlugin` bails
// without a `RangeSelection` — so this is a precondition of the paste path
// itself, not incidental setup.
function placeCaretInEmptyBody(editor: LexicalEditor): void {
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      const paragraph = $createParagraphNode();
      root.append(paragraph);
      paragraph.selectStart();
    },
    { discrete: true },
  );
}

describe("MarkdownPastePlugin", () => {
  // The reported bug: a plain-text clipboard payload (no text/html, no
  // Lexical clipboard format — matching a copy from a plain-text source)
  // starting with `> ` used to insert as literal text, only rendering as a
  // blockquote after the dialog was closed and reopened. Asserts the
  // rendered DOM, not just the node tree, since the bug was specifically
  // about the visible render lagging the file-load path.
  test("pasting plain text starting with `> ` renders as a blockquote immediately", async () => {
    const { editor, screen } = await renderTestEditor({ plugins: <MarkdownPastePlugin /> });

    placeCaretInEmptyBody(editor);

    const handled = dispatchCommand(editor, PASTE_COMMAND, buildPasteEvent("> hello world"));
    expect(handled).toBe(true);

    const textbox = screen.getByRole("textbox");
    const editorRoot = textbox.element();
    expect(editorRoot.children).toHaveLength(1);
    const quote = editorRoot.firstElementChild;
    expect(quote?.tagName).toBe("BLOCKQUOTE");
    expect(quote?.textContent).toBe("hello world");
  });

  // Same fix, a different block transformer — pasting isn't quote-specific,
  // it runs the pasted text through the full MARKDOWN_TRANSFORMERS pipeline.
  test("pasting plain text starting with `# ` renders as <h1> immediately", async () => {
    const { editor, screen } = await renderTestEditor({ plugins: <MarkdownPastePlugin /> });

    placeCaretInEmptyBody(editor);

    const handled = dispatchCommand(editor, PASTE_COMMAND, buildPasteEvent("# Hello"));
    expect(handled).toBe(true);

    const textbox = screen.getByRole("textbox");
    const editorRoot = textbox.element();
    expect(editorRoot.children).toHaveLength(1);
    const heading = editorRoot.firstElementChild;
    expect(heading?.tagName).toBe("H1");
    expect(heading?.textContent).toBe("Hello");
  });

  // A clipboard payload that ALSO carries text/html already renders
  // correctly through RichTextPlugin's own HTML importer (that's not the
  // bug this plugin fixes) — reinterpreting it as Markdown source on top of
  // that would be a lossy downgrade for real rich content. The plugin must
  // bail and let the existing text/html path run unmodified.
  test("a clipboard payload also carrying text/html is left to the default importer (no quote created)", async () => {
    const { editor } = await renderTestEditor({ plugins: <MarkdownPastePlugin /> });

    placeCaretInEmptyBody(editor);

    dispatchCommand(
      editor,
      PASTE_COMMAND,
      buildPasteEvent("> hello world", { "text/html": "<span>&gt; hello world</span>" }),
    );

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildren().some($isQuoteNode)).toBe(false);
    });
  });

  // Code-block content is raw text by construction (a CodeNode can't legally
  // contain a QuoteNode child) — a paste inside one must stay exactly as
  // literal as a typed `> ` already does there.
  test("pasting markdown-like text inside a fenced code block stays literal", async () => {
    const { editor } = await renderTestEditor({ plugins: <MarkdownPastePlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const code = $createCodeNode();
        code.append($createTextNode("const x = 1;"));
        root.append(code);
        code.selectEnd();
      },
      { discrete: true },
    );

    const handled = dispatchCommand(editor, PASTE_COMMAND, buildPasteEvent("> not a quote"));
    expect(handled).toBe(true);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);
      const code = root.getFirstChild();
      if (!$isCodeNode(code)) throw new Error("expected CodeNode at root[0]");
      expect(code.getTextContent()).toContain("> not a quote");
      expect(root.getChildren().some($isQuoteNode)).toBe(false);
    });
  });

  // Table cells ban quote/list content the same way typing `> ` / `- ` in a
  // cell already stays literal (see transformers.ts's cell-aware wrappers) —
  // a paste must match that, not silently promote to a block the cell's key
  // surface / CSS don't support.
  test("pasting markdown-like text inside a table cell stays literal", async () => {
    const { editor } = await renderTestEditor({
      plugins: (
        <>
          <TablePlugin hasHorizontalScroll />
          <MarkdownPastePlugin />
        </>
      ),
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const table = $seedTableWithEmptyCell();
        root.append(table);
        getOnlyCell(table).selectEnd();
      },
      { discrete: true },
    );

    const handled = dispatchCommand(editor, PASTE_COMMAND, buildPasteEvent("> not a quote"));
    expect(handled).toBe(true);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const table = root.getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      const cell = getOnlyCell(table);
      expect(cell.getTextContent()).toContain("> not a quote");
      expect(cell.getChildren().some($isQuoteNode)).toBe(false);
    });
  });

  // Ordering contract with PasteLinkPlugin (see MarkdownEditor.tsx — both
  // registered at COMMAND_PRIORITY_LOW, PasteLinkPlugin mounted first): a
  // bare URL pasted over a real selection is still claimed by PasteLinkPlugin
  // first, not reinterpreted as Markdown source by this plugin.
  test("a bare-URL paste over a selection is still claimed by PasteLinkPlugin", async () => {
    const { editor } = await renderTestEditor({
      plugins: (
        <>
          <PasteLinkPlugin />
          <MarkdownPastePlugin />
        </>
      ),
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        const text = $createTextNode("hello");
        paragraph.append(text);
        root.append(paragraph);
        text.select(0, text.getTextContentSize());
      },
      { discrete: true },
    );

    const handled = dispatchCommand(editor, PASTE_COMMAND, buildPasteEvent("https://example.com"));
    expect(handled).toBe(true);

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const paragraph = root.getFirstChild();
      if (!$isParagraphNode(paragraph)) throw new Error("expected ParagraphNode at root[0]");
      const link = paragraph.getFirstChild();
      if (!$isLinkNode(link)) throw new Error("expected LinkNode wrapping the pasted selection");
      expect(link.getTextContent()).toBe("hello");
      expect(link.getURL()).toBe("https://example.com");
    });
  });

  // Windows/Word-style clipboard payloads use CRLF line endings; a stray `\r`
  // left on a line would ride along as trailing garbage in the imported text.
  test("CRLF line endings in the pasted text don't leak into the rendered content", async () => {
    const { editor } = await renderTestEditor({ plugins: <MarkdownPastePlugin /> });

    placeCaretInEmptyBody(editor);

    dispatchCommand(editor, PASTE_COMMAND, buildPasteEvent("> hello world\r\n"));

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const quote = root.getFirstChild();
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      expect(quote.getTextContent()).toBe("hello world");
    });
  });
});

// Every case above pastes `> ` or `# ` — payloads whose element transformer
// goes through `LexicalNode.replace()`, which clones the live selection and
// installs the clone. That accident used to be the ONLY reason those pastes
// worked: the plugin captured `$getSelection()` before the import and
// re-asserted it after, and the clone left the captured object intact.
//
// Every payload that does NOT hit `replace()` — a plain paragraph, a fenced
// code block (a multiline transformer), a table, a bare URL at a collapsed
// caret — left the captured object as the live selection, which
// `@lexical/markdown`'s trailing `root.selectStart()` then rewrote in place
// to point inside the detached scratch node. `$insertGeneratedNodes` ran
// against a parentless block and threw mid-update, and because `onError`
// rethrew, Lexical never rolled back: every subsequent keystroke failed the
// same way and the editor was dead until the dialog remounted it.
//
// These cases pin the payload classes that carried zero coverage. Any error
// Lexical reports fails them automatically via `renderTestEditor` (see
// `failTestOnLexicalError` in `__tests__/utils.tsx`), so the "and the editor
// still works afterwards" half needs no separate assertion — except in the
// first case, which types after the paste to pin the user-visible symptom.
describe("MarkdownPastePlugin (payloads that bypass LexicalNode.replace)", () => {
  test("pasting a plain paragraph inserts it and leaves the editor usable", async () => {
    const { editor, screen, user } = await renderTestEditor({
      plugins: <MarkdownPastePlugin />,
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    const handled = dispatchCommand(editor, PASTE_COMMAND, buildPasteEvent("hello world"));
    expect(handled).toBe(true);

    await user.keyboard("!");

    const editorRoot = textbox.element();
    expect(editorRoot.children).toHaveLength(1);
    const paragraph = editorRoot.firstElementChild;
    expect(paragraph?.tagName).toBe("P");
    expect(paragraph?.textContent).toBe("hello world!");
  });

  test("pasting a plain paragraph at the end of an existing line appends to it", async () => {
    const { editor, screen } = await renderTestEditor({ plugins: <MarkdownPastePlugin /> });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        const text = $createTextNode("seed ");
        paragraph.append(text);
        root.append(paragraph);
        paragraph.selectEnd();
      },
      { discrete: true },
    );

    const handled = dispatchCommand(editor, PASTE_COMMAND, buildPasteEvent("hello world"));
    expect(handled).toBe(true);

    const editorRoot = screen.getByRole("textbox").element();
    expect(editorRoot.children).toHaveLength(1);
    const paragraph = editorRoot.firstElementChild;
    expect(paragraph?.tagName).toBe("P");
    expect(paragraph?.textContent).toBe("seed hello world");
  });

  test("pasting multi-line plain text renders one paragraph per line", async () => {
    const { editor, screen } = await renderTestEditor({ plugins: <MarkdownPastePlugin /> });

    placeCaretInEmptyBody(editor);

    const handled = dispatchCommand(editor, PASTE_COMMAND, buildPasteEvent("line one\nline two"));
    expect(handled).toBe(true);

    const editorRoot = screen.getByRole("textbox").element();
    expect(editorRoot.children).toHaveLength(2);
    expect(Array.from(editorRoot.children).map((c) => c.tagName)).toEqual(["P", "P"]);
    expect(Array.from(editorRoot.children).map((c) => c.textContent)).toEqual([
      "line one",
      "line two",
    ]);
  });

  // The CRLF case above pastes `> hello world\r\n`, so it rides the safe
  // `replace()` path; this is the same normalization on a payload that
  // doesn't. A stray `\r` would survive as trailing garbage on line one.
  test("CRLF line endings in plain multi-line text don't leak into the content", async () => {
    const { editor } = await renderTestEditor({ plugins: <MarkdownPastePlugin /> });

    placeCaretInEmptyBody(editor);

    dispatchCommand(editor, PASTE_COMMAND, buildPasteEvent("line one\r\nline two"));

    editor.getEditorState().read(() => {
      const children = $getRoot().getChildren();
      expect(children.map((c) => c.getTextContent())).toEqual(["line one", "line two"]);
    });
  });

  test("pasting a fenced code block renders as a code block", async () => {
    const { editor } = await renderTestEditor({ plugins: <MarkdownPastePlugin /> });

    placeCaretInEmptyBody(editor);

    const handled = dispatchCommand(
      editor,
      PASTE_COMMAND,
      buildPasteEvent("```ts\nconst a = 1;\n```"),
    );
    expect(handled).toBe(true);

    editor.getEditorState().read(() => {
      const code = $getRoot().getFirstChild();
      if (!$isCodeNode(code)) throw new Error("expected CodeNode at root[0]");
      expect(code.getLanguage()).toBe("ts");
      expect(code.getTextContent()).toBe("const a = 1;");
    });
  });

  // A table drives `$createTableCell`, which runs a SECOND, nested markdown
  // import into a freshly created (still detached) cell — the same hazard one
  // level down. `TablePlugin` is mounted because the pasted TableNode needs
  // it to render.
  test("pasting a GFM table renders a table with the cell contents", async () => {
    const { editor } = await renderTestEditor({
      plugins: (
        <>
          <TablePlugin />
          <MarkdownPastePlugin />
        </>
      ),
    });

    placeCaretInEmptyBody(editor);

    const handled = dispatchCommand(
      editor,
      PASTE_COMMAND,
      buildPasteEvent("| a | b |\n| --- | --- |\n| 1 | 2 |"),
    );
    expect(handled).toBe(true);

    editor.getEditorState().read(() => {
      const table = $getRoot().getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected TableNode at root[0]");
      expect(table.getChildrenSize()).toBe(2);
      expect(table.getTextContent().split("\n\n")).toEqual(["a", "b", "1", "2"]);
    });
  });

  // `PasteLinkPlugin` declines a collapsed caret (there is no text to wrap),
  // so a bare URL falls through to this plugin as ordinary paragraph text.
  test("a bare-URL paste at a collapsed caret inserts the URL as text", async () => {
    const { editor, screen } = await renderTestEditor({
      plugins: (
        <>
          <PasteLinkPlugin />
          <MarkdownPastePlugin />
        </>
      ),
    });

    placeCaretInEmptyBody(editor);

    const handled = dispatchCommand(editor, PASTE_COMMAND, buildPasteEvent("https://example.com"));
    expect(handled).toBe(true);

    const editorRoot = screen.getByRole("textbox").element();
    expect(editorRoot.children).toHaveLength(1);
    const paragraph = editorRoot.firstElementChild;
    expect(paragraph?.tagName).toBe("P");
    expect(paragraph?.textContent).toBe("https://example.com");
  });
});
