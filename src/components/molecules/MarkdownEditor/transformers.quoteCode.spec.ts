import { $isCodeNode } from "@lexical/code";
import { $isQuoteNode } from "@lexical/rich-text";
import { $isTableCellNode, $isTableNode, $isTableRowNode } from "@lexical/table";
import { $getRoot, $isParagraphNode } from "lexical";
import { describe, expect, test } from "vitest";

import { $readMarkdown, $setMarkdown, createTestHeadlessEditor } from "./__tests__/utils";

// QUOTE_CODE (transformers.ts) is what lets a fenced code block render
// inside a blockquote. `@lexical/markdown`'s import is strictly line-by-line
// against a single flat transformer set — without a dedicated multiline
// transformer for the quote-prefixed shape, a `> ```js` line was claimed by
// the plain QUOTE transformer first, stripping the `> ` and leaving
// `` ```js `` behind as literal paragraph text (the exact "can't render" bug
// this file exists to fix).
describe("QUOTE_CODE transformer", () => {
  test("a code fence inside a depth-1 quote round-trips identically", () => {
    const editor = createTestHeadlessEditor();
    const source = "> ```js\n> const x = 1;\n> ```";
    $setMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  test("imports the fence as a real CodeNode child of the QuoteNode, not literal text", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "> ```js\n> const x = 1;\n> ```");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const quote = root.getFirstChild();
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      expect(quote.getChildrenSize()).toBe(1);

      const codeNode = quote.getFirstChild();
      if (!$isCodeNode(codeNode)) throw new Error("expected CodeNode inside the quote");
      expect(codeNode.getLanguage()).toBe("js");
      expect(codeNode.getTextContent()).toBe("const x = 1;");
    });
  });

  test("a code fence with no language round-trips and imports with an unset language", () => {
    const editor = createTestHeadlessEditor();
    const source = "> ```\n> plain\n> ```";
    $setMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);

    editor.getEditorState().read(() => {
      const quote = $getRoot().getFirstChild();
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      const codeNode = quote.getFirstChild();
      if (!$isCodeNode(codeNode)) throw new Error("expected CodeNode inside the quote");
      expect(codeNode.getLanguage()).toBeUndefined();
    });
  });

  // A blank line WITHIN the fenced body still needs its own bare `>` marker
  // (CommonMark has no lazy continuation for a fenced block inside a
  // blockquote) — the round trip must preserve it as a real blank code line,
  // not collapse it or drop out of the quote.
  // Import accepts either a bare `>` or a `> ` (trailing space) for a blank
  // quote line — same two shapes `QUOTE_REGEX` itself accepts (see
  // `stripQuotePrefix`'s header). Export always normalizes to the canonical
  // `> ` form, matching how an ordinary blank quote LINE (outside any code
  // fence) already round-trips per `transformers.quote.spec.ts`.
  test("a blank line inside a quoted code fence round-trips as a bare `>` marker line", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "> ```\n> a\n>\n> b\n> ```");
    expect($readMarkdown(editor)).toBe("> ```\n> a\n> \n> b\n> ```");

    editor.getEditorState().read(() => {
      const quote = $getRoot().getFirstChild();
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      const codeNode = quote.getFirstChild();
      if (!$isCodeNode(codeNode)) throw new Error("expected CodeNode inside the quote");
      expect(codeNode.getTextContent()).toBe("a\n\nb");
    });
  });

  test("a code fence inside a depth-2 nested quote round-trips and imports at the right depth", () => {
    const editor = createTestHeadlessEditor();
    const source = "> > ```js\n> > const x = 1;\n> > ```";
    $setMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);

    editor.getEditorState().read(() => {
      const outer = $getRoot().getFirstChild();
      if (!$isQuoteNode(outer)) throw new Error("expected outer QuoteNode at root[0]");
      expect(outer.getChildrenSize()).toBe(1);

      const inner = outer.getFirstChild();
      if (!$isQuoteNode(inner)) throw new Error("expected inner QuoteNode inside outer quote");
      expect(inner.getChildrenSize()).toBe(1);

      const codeNode = inner.getFirstChild();
      if (!$isCodeNode(codeNode)) throw new Error("expected CodeNode inside the inner quote");
      expect(codeNode.getLanguage()).toBe("js");
      expect(codeNode.getTextContent()).toBe("const x = 1;");
    });
  });

  // A quote line, then a fenced block, then another quote line — all at the
  // same depth — must land as three siblings inside ONE QuoteNode (mirroring
  // how consecutive plain quote lines merge into one QuoteNode with multiple
  // paragraph children), not split into separate adjacent quote blocks.
  test("quote text before and after a quoted code fence stay in the same QuoteNode", () => {
    const editor = createTestHeadlessEditor();
    const source = "> before\n> ```js\n> code\n> ```\n> after";
    $setMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);

    editor.getEditorState().read(() => {
      const quote = $getRoot().getFirstChild();
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      expect(quote.getChildrenSize()).toBe(3);

      const before = quote.getChildAtIndex(0);
      if (!$isParagraphNode(before)) throw new Error("expected ParagraphNode at quote[0]");
      expect(before.getTextContent()).toBe("before");

      const codeNode = quote.getChildAtIndex(1);
      if (!$isCodeNode(codeNode)) throw new Error("expected CodeNode at quote[1]");
      expect(codeNode.getTextContent()).toBe("code");

      const after = quote.getChildAtIndex(2);
      if (!$isParagraphNode(after)) throw new Error("expected ParagraphNode at quote[2]");
      expect(after.getTextContent()).toBe("after");
    });
  });

  // Fence-width preservation (Cork's own CODE override) must keep working
  // for a quoted fence too — a 4-backtick fence is how a quoted code block
  // embeds literal triple-backtick content.
  test("a widened fence inside a quote survives round-trip", () => {
    const editor = createTestHeadlessEditor();
    const source = "> ````\n> show ```code```\n> ````";
    $setMarkdown(editor, source);
    expect($readMarkdown(editor)).toBe(source);
  });

  // The opening AND closing fence on the same quoted line — rare, but the
  // regex structurally accepts it (mirrors CODE's own single-line branch).
  // Not a round-trip case: CODE.export has no memory of "was this
  // single-line" (it always re-serializes to the canonical multi-line
  // shape) — same INHERENT lossiness the top-level CODE transformer already
  // has for this shape, not something specific to being inside a quote.
  test("an opening and closing fence on the same quoted line imports as a one-line CodeNode", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "> ```code```");

    editor.getEditorState().read(() => {
      const quote = $getRoot().getFirstChild();
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      const codeNode = quote.getFirstChild();
      if (!$isCodeNode(codeNode)) throw new Error("expected CodeNode inside the quote");
      // Mirrors CODE's own same-line branch: the language is dropped for
      // this shape (see that transformer's header for why).
      expect(codeNode.getLanguage()).toBeUndefined();
      expect(codeNode.getTextContent()).toBe("code");
    });

    expect($readMarkdown(editor)).toBe("> ```\n> code\n> ```");
  });

  // A fence opened inside a quote but never closed before the quote itself
  // ends (the next line isn't quote-prefixed at all) must decline the
  // multiline match entirely and fall through to ordinary per-line QUOTE
  // handling — not silently swallow the unrelated following content into a
  // bogus code block.
  test("an unterminated quoted fence falls back to literal quote text instead of consuming later content", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, "> ```js\nplain paragraph");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(2);

      const quote = root.getChildAtIndex(0);
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      const literal = quote.getFirstChild();
      if (!$isParagraphNode(literal)) throw new Error("expected literal ParagraphNode in quote");
      expect(literal.getTextContent()).toBe("```js");

      const plain = root.getChildAtIndex(1);
      if (!$isParagraphNode(plain)) throw new Error("expected plain ParagraphNode at root[1]");
      expect(plain.getTextContent()).toBe("plain paragraph");
    });
  });

  // Mirrors CELL_AWARE_QUOTE's own table-cell guard: a quoted code fence
  // typed or reloaded inside a table cell body must stay literal text, not
  // build a QuoteNode/CodeNode pair inside the cell (lists/quotes are banned
  // there — see the "Lists inside table cells are banned" architectural
  // decision in AGENTS.md). The cell body is authored with escaped `\n`s
  // (decoded back to real newlines by `decodeCell` before the recursive
  // parse — see `$createTableCell` in transformers.ts) so every line still
  // carries its own `> ` marker, exactly the shape that WOULD build a nested
  // QuoteNode + CodeNode without the guard.
  test("a quoted code fence inside a table cell stays literal (no nested quote/code built)", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, ["| a |", "| --- |", "| > ```js\\n> code\\n> ``` |"].join("\n"));

    editor.getEditorState().read(() => {
      const table = $getRoot().getFirstChild();
      if (!$isTableNode(table)) throw new Error("expected a TableNode");
      const bodyRow = table.getChildAtIndex(1);
      if (!$isTableRowNode(bodyRow)) throw new Error("expected the body TableRowNode");
      const cell = bodyRow.getFirstChild();
      if (!$isTableCellNode(cell)) throw new Error("expected a TableCellNode");

      // No QuoteNode/CodeNode got built anywhere inside the cell — every
      // line stayed literal text, same as CELL_AWARE_QUOTE's own guard.
      for (const descendant of cell.getChildren()) {
        expect($isQuoteNode(descendant)).toBe(false);
        expect($isCodeNode(descendant)).toBe(false);
      }
      expect(cell.getTextContent()).toContain("```js");
      expect(cell.getTextContent()).toContain("```");
    });
  });

  // Regression: QUOTE_CODE_START_REGEX originally required the fence to sit
  // immediately after exactly one whitespace char following the quote
  // marker, with no tolerance for further indentation — unlike upstream's
  // own CODE_START_REGEX and this transformer's own closing-fence check,
  // both of which accept leading `[ \t]*`. An indented quoted fence (valid
  // CommonMark) silently fell through to literal quote text instead of
  // building a real CodeNode.
  test("a quoted fence indented past the quote marker still imports as a real CodeNode", () => {
    const editor = createTestHeadlessEditor();
    $setMarkdown(editor, ">   ```js\n> const x = 1;\n> ```");

    editor.getEditorState().read(() => {
      const quote = $getRoot().getFirstChild();
      if (!$isQuoteNode(quote)) throw new Error("expected QuoteNode at root[0]");
      const codeNode = quote.getFirstChild();
      if (!$isCodeNode(codeNode)) throw new Error("expected CodeNode inside the quote");
      expect(codeNode.getLanguage()).toBe("js");
      expect(codeNode.getTextContent()).toBe("const x = 1;");
    });
  });
});
