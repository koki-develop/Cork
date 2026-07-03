import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  HISTORIC_TAG,
  type LexicalNode,
  type TextFormatType,
  type TextNode,
} from "lexical";
import { describe, expect, test } from "vitest";

import { $readMarkdown, renderTestEditor } from "./__tests__/utils";
import { BoundaryStrictFormatPlugin } from "./BoundaryStrictFormatPlugin";

// The bug this plugin exists for: `RangeSelection.format` is Lexical's
// persistent "pending format" — once the caret has read a formatted
// TextNode's format into it, nothing resets it when the caret leaves the run.
// So opening a task with just `` `a` `` (or `==a==`) and typing / newlining /
// deleting-all carries the pending bit onto whatever the user types next,
// silently extending the span (or worse, opening a new one on a fresh line or
// empty paragraph). Both `code` and `highlight` reproduce this identically —
// they're the two "exact-substring delimiter pair" formats — so the suite
// below runs the same scenario table against both to prove the mechanism
// generalizes, plus cross-cutting guards: stylistic formats (bold) must still
// extend on end-of-run typing, and the two boundary-strict bits must be
// tracked INDEPENDENTLY of each other.
function readInlineFormats(
  paragraph: LexicalNode | null,
  format: TextFormatType,
): Array<[string, boolean]> {
  if (!$isElementNode(paragraph)) throw new Error("expected ElementNode");
  return paragraph
    .getChildren()
    .filter((child): child is TextNode => $isTextNode(child))
    .map((child) => [child.getTextContent(), child.hasFormat(format)]);
}

const BOUNDARY_STRICT_CASES: ReadonlyArray<{
  format: TextFormatType;
  delimiter: string;
}> = [
  { delimiter: "`", format: "code" },
  { delimiter: "==", format: "highlight" },
];

describe.each(BOUNDARY_STRICT_CASES)(
  "BoundaryStrictFormatPlugin — $format",
  ({ format, delimiter }) => {
    test(`typing after ${delimiter}a${delimiter} inserts a PLAIN text node (does not extend the ${format} span)`, async () => {
      const { editor, screen, user } = await renderTestEditor({
        initialValue: `${delimiter}a${delimiter}`,
        plugins: <BoundaryStrictFormatPlugin />,
      });

      // Click first so the editable has real focus, then programmatically place
      // the caret at the end of the formatted run. A trailing click would
      // clobber the precise position we need for the assertion.
      const textbox = screen.getByRole("textbox");
      await user.click(textbox);

      editor.update(
        () => {
          const paragraph = $getRoot().getFirstChild();
          if (!$isParagraphNode(paragraph)) throw new Error("expected ParagraphNode");
          const formattedNode = paragraph.getFirstChild();
          if (!$isTextNode(formattedNode)) throw new Error("expected TextNode");
          formattedNode.select(1, 1);
        },
        { discrete: true },
      );

      await user.keyboard("b");

      editor.getEditorState().read(() => {
        const paragraph = $getRoot().getFirstChild();
        expect(readInlineFormats(paragraph, format)).toEqual([
          ["a", true],
          ["b", false],
        ]);
      });

      expect($readMarkdown(editor)).toBe(`${delimiter}a${delimiter}b`);
    });

    test(`Enter after ${delimiter}a${delimiter} then typing produces a plain paragraph on the new line`, async () => {
      const { editor, screen, user } = await renderTestEditor({
        initialValue: `${delimiter}a${delimiter}`,
        plugins: <BoundaryStrictFormatPlugin />,
      });

      const textbox = screen.getByRole("textbox");
      await user.click(textbox);

      editor.update(
        () => {
          const paragraph = $getRoot().getFirstChild();
          if (!$isParagraphNode(paragraph)) throw new Error("expected ParagraphNode");
          const formattedNode = paragraph.getFirstChild();
          if (!$isTextNode(formattedNode)) throw new Error("expected TextNode");
          formattedNode.select(1, 1);
        },
        { discrete: true },
      );

      await user.keyboard("{Enter}b");

      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(2);
        expect(readInlineFormats(root.getChildAtIndex(0), format)).toEqual([["a", true]]);
        expect(readInlineFormats(root.getChildAtIndex(1), format)).toEqual([["b", false]]);
      });

      // Cork's `$readMarkdown` uses `shouldPreserveNewLines: true`, so root
      // paragraphs join with a single `\n` (one Enter = one paragraph break);
      // `\n\n` is reserved for an explicit blank paragraph between them.
      expect($readMarkdown(editor)).toBe(`${delimiter}a${delimiter}\nb`);
    });

    test(`deleting the only ${format} character then typing produces a plain paragraph`, async () => {
      const { editor, screen, user } = await renderTestEditor({
        initialValue: `${delimiter}a${delimiter}`,
        plugins: <BoundaryStrictFormatPlugin />,
      });

      const textbox = screen.getByRole("textbox");
      await user.click(textbox);

      editor.update(
        () => {
          const paragraph = $getRoot().getFirstChild();
          if (!$isParagraphNode(paragraph)) throw new Error("expected ParagraphNode");
          const formattedNode = paragraph.getFirstChild();
          if (!$isTextNode(formattedNode)) throw new Error("expected TextNode");
          formattedNode.select(1, 1);
        },
        { discrete: true },
      );

      await user.keyboard("{Backspace}b");

      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(1);
        expect(readInlineFormats(root.getFirstChild(), format)).toEqual([["b", false]]);
      });

      expect($readMarkdown(editor)).toBe("b");
    });

    test(`interior caret in ${delimiter}abc${delimiter} keeps the pending ${format} bit ON, so typing extends the span`, async () => {
      const { editor, screen, user } = await renderTestEditor({
        initialValue: `${delimiter}abc${delimiter}`,
        plugins: <BoundaryStrictFormatPlugin />,
      });

      const textbox = screen.getByRole("textbox");
      await user.click(textbox);

      editor.update(
        () => {
          const paragraph = $getRoot().getFirstChild();
          if (!$isParagraphNode(paragraph)) throw new Error("expected ParagraphNode");
          const formattedNode = paragraph.getFirstChild();
          if (!$isTextNode(formattedNode)) throw new Error("expected TextNode");
          formattedNode.select(1, 1);
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
        expect(selection.hasFormat(format)).toBe(true);
      });

      await user.keyboard("X");

      editor.getEditorState().read(() => {
        const paragraph = $getRoot().getFirstChild();
        expect(readInlineFormats(paragraph, format)).toEqual([["aXbc", true]]);
      });

      expect($readMarkdown(editor)).toBe(`${delimiter}aXbc${delimiter}`);
    });

    test(`a HISTORIC_TAG (undo/redo) commit does not flip the ${format} bit — plugin bails so no untagged history entry lands atop the undo target`, async () => {
      // Reproduces the exact hazard the plugin's header comment discusses:
      // Ctrl+Z restores a prior editorState whose `selection.format` bit
      // legitimately disagrees with the caret's current context (e.g. a pending
      // prime at end-of-run boundary). If the plugin flipped it here, the
      // discrete follow-up would land as a NEW history entry on top of the undo
      // target, silently making Ctrl+Y redo to the flipped state instead of the
      // user's original text.
      const { editor, screen, user } = await renderTestEditor({
        initialValue: `${delimiter}a${delimiter}`,
        plugins: <BoundaryStrictFormatPlugin />,
      });

      const textbox = screen.getByRole("textbox");
      await user.click(textbox);

      // Simulate the restore: caret at the end-boundary of the formatted run
      // with the pending bit still set, delivered with HISTORIC_TAG.
      editor.update(
        () => {
          const paragraph = $getRoot().getFirstChild();
          if (!$isParagraphNode(paragraph)) throw new Error("expected ParagraphNode");
          const formattedNode = paragraph.getFirstChild();
          if (!$isTextNode(formattedNode)) throw new Error("expected TextNode");
          formattedNode.select(1, 1);
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.format = formattedNode.getFormat();
        },
        { discrete: true, tag: HISTORIC_TAG },
      );

      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
        // Preserved — the plugin must not touch a HISTORIC_TAG-carried commit.
        expect(selection.hasFormat(format)).toBe(true);
      });
    });

    test(`a zero-length TextNode wedged between two ${format} siblings still reads as INSIDE ${format}`, async () => {
      // Regression guard against the "empty splitter" edge case: the
      // two-neighbor probe looks at the character on each side of the caret,
      // not at the format of the empty node itself. Without this, a split
      // (from IME / manual splitText / boundary-format toggle) that leaves a
      // zero-length TextNode between two same-formatted TextNodes would
      // silently clear the pending bit and let the next typed char break the
      // visually continuous span.
      const { editor, screen, user } = await renderTestEditor({
        plugins: <BoundaryStrictFormatPlugin />,
      });

      const textbox = screen.getByRole("textbox");
      await user.click(textbox);

      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          const paragraph = $createParagraphNode();
          const left = $createTextNode("ab");
          left.toggleFormat(format);
          const middle = $createTextNode("");
          const right = $createTextNode("cd");
          right.toggleFormat(format);
          paragraph.append(left, middle, right);
          root.append(paragraph);
          middle.select(0, 0);
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
        // The plugin's listener has already run (registerUpdateListener fires on
        // commit) — it must have observed "both neighbours match" and left the
        // bit ON (the initial format was 0, and it flipped it to 1).
        expect(selection.hasFormat(format)).toBe(true);
      });
    });
  },
);

describe("BoundaryStrictFormatPlugin — cross-cutting guards", () => {
  test("bold format is NOT touched: typing at the end of `**a**` still extends the bold run", async () => {
    // Standard rich-text UX guard: stylistic formats should still be sticky
    // at end-of-run — only formats in BOUNDARY_STRICT_FORMATS are normalized.
    // Direct assertion ensures the plugin doesn't over-reach into
    // bold/italic/strikethrough.
    const { editor, screen, user } = await renderTestEditor({
      plugins: <BoundaryStrictFormatPlugin />,
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        const boldText = $createTextNode("a");
        boldText.toggleFormat("bold");
        paragraph.append(boldText);
        root.append(paragraph);
        boldText.select(1, 1);
        // Seed the pending format bit — reproduces the state a real click at
        // the end of the run would produce. Lexical's own `select()` only
        // repositions anchor/focus; the format field is populated by
        // `$internalCreateRangeSelection` on the next native selection sync.
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.format = boldText.getFormat();
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      // The plugin must have observed the seeded state without clearing bold —
      // bold is not in BOUNDARY_STRICT_FORMATS.
      expect(selection.hasFormat("bold")).toBe(true);
      expect(selection.hasFormat("code")).toBe(false);
    });

    await user.keyboard("b");

    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild();
      if (!$isParagraphNode(paragraph)) throw new Error("expected ParagraphNode");
      const children = paragraph.getChildren().filter($isTextNode);
      expect(children).toHaveLength(1);
      expect(children[0]?.getTextContent()).toBe("ab");
      expect(children[0]?.hasFormat("bold")).toBe(true);
    });
  });

  test("code and highlight bits are tracked INDEPENDENTLY: caret between a code+highlight run and a highlight-only run resets code but keeps highlight", async () => {
    // A single TextNode can carry both bits at once (`==`code`==`, highlight
    // wrapping an inline code span). This proves the plugin evaluates each
    // format in BOUNDARY_STRICT_FORMATS against ITS OWN neighbour pair,
    // rather than some shared "is anything formatted here" check that would
    // conflate the two.
    const { editor, screen, user } = await renderTestEditor({
      plugins: <BoundaryStrictFormatPlugin />,
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        const left = $createTextNode("ab");
        left.toggleFormat("code");
        left.toggleFormat("highlight");
        const right = $createTextNode("cd");
        right.toggleFormat("highlight");
        paragraph.append(left, right);
        root.append(paragraph);
        // Caret at the boundary between `left` (code+highlight) and `right`
        // (highlight only).
        left.select(2, 2);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      // `right` doesn't carry code, so the caret is NOT inside a continuous
      // code run — the code bit must read false.
      expect(selection.hasFormat("code")).toBe(false);
      // Both neighbours carry highlight, so the caret IS inside a continuous
      // highlight run — the highlight bit must read true.
      expect(selection.hasFormat("highlight")).toBe(true);
    });
  });

  // An element-anchor (the Point references a paragraph + child index, not a
  // TextNode + offset) is reached e.g. after backspacing a paragraph's only
  // character away — `ParagraphNode` doesn't override `canBeEmpty()`
  // (defaults to `true` on `ElementNode`), so a fully-emptied paragraph's
  // caret resolves to an element-anchor at offset 0, not a text-anchor on a
  // (nonexistent) empty TextNode. `$adjacentFormattableText` returns `null`
  // unconditionally for this case — see that function's header for why a
  // child-index traversal would be unreachable dead code (Lexical itself
  // normalizes any element-anchor that would have a TextNode on both sides
  // into the equivalent text-anchor before any listener observes it, so an
  // element-anchor can only ever occur at an actual paragraph boundary, where
  // one side is structurally empty regardless of tree contents). This test
  // pins that "always null" behavior directly against the case that reaches
  // it in practice, rather than relying only on the end-to-end "deleting the
  // only format character" scenario elsewhere in this file to exercise it
  // incidentally.
  test("element-anchor caret (e.g. after deleting all content) always reads as outside every atomic format", async () => {
    const { editor, screen, user } = await renderTestEditor({
      plugins: <BoundaryStrictFormatPlugin />,
    });

    const textbox = screen.getByRole("textbox");
    await user.click(textbox);

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        root.append(paragraph);
        paragraph.select(0, 0);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected RangeSelection");
      expect(selection.anchor.type).toBe("element");
      expect(selection.hasFormat("code")).toBe(false);
      expect(selection.hasFormat("highlight")).toBe(false);
    });
  });
});
