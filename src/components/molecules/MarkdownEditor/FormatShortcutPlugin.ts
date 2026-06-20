import { $isCodeNode } from "@lexical/code";
import type { TextFormatTransformer } from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $addUpdateTag,
  $createRangeSelection,
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COLLABORATION_TAG,
  COMPOSITION_END_TAG,
  HISTORIC_TAG,
  HISTORY_PUSH_TAG,
  type TextNode,
} from "lexical";
import { useEffect } from "react";

import { $isFormattableTextNode } from "./codeBlock";

// Owns the inline-format Markdown shortcut (`**bold**` / `*italic*` /
// `~~strike~~` / `` `code` `` / `==highlight==`), replacing the buggy version
// shipped by @lexical/markdown's MarkdownShortcuts (the text-format leg of its
// `$runTextFormatTransformers`).
//
// The upstream bug:
//
//   Wrapping already-bold text with `**...**` un-bolds it. After the closing
//   `**` is typed, MarkdownShortcuts strips the markers and applies the format
//   via `nextSelection.formatText(format)` — which TOGGLES based on the first
//   node's current format. So `formatText('bold')` over an already-bold text
//   node clears the bold. The pre-check `if (!nextSelection.hasFormat(format))`
//   reads the freshly-created RangeSelection's own format field (always 0), not
//   the underlying text's format, so it never short-circuits.
//
// The fix: keep all of upstream's pattern detection (open/close tag location,
// intraword guard, repeating-char guard, code-span precedence, sibling
// traversal) and replace only the format-application step. Instead of calling
// `formatText` (toggle), we walk every formattable text node in the matched
// range and turn the format ON if it isn't already — never off. So
// `**` around bold text just consumes the markers; `*italic*` around plain
// text adds italic; `==` around already-highlighted text leaves the highlight.
// Mirrors `FormatFormattableTextPlugin`'s set-ON semantics so the shortcut and
// the toolbar can never disagree.
//
// Cohabitation with @lexical/markdown's MarkdownShortcutPlugin: we don't
// disable that plugin (it still handles element / multiline / text-match
// transformers). The caller strips the text-format transformers from the
// list it passes to MarkdownShortcutPlugin, so upstream's
// `$runTextFormatTransformers` sees an empty matcher table and short-circuits
// — no double-format, no race. The full transformer list still flows through
// to import/export.
//
// Only text-format transformers (`type === 'text-format'`) are handled here.
// Element / text-match / multiline-element transformers stay with the
// upstream plugin.
export type FormatShortcutPluginProps = {
  transformers: ReadonlyArray<TextFormatTransformer>;
};

export function FormatShortcutPlugin({ transformers }: FormatShortcutPluginProps): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Index by trigger char (the last char of each tag). For `*` this gives
    // [BOLD_ITALIC_STAR, BOLD_STAR, ITALIC_STAR] — longer tags first, matching
    // the order the caller hands us, so `***` wins over `**` wins over `*`.
    const transformersByTrigger: Record<string, TextFormatTransformer[]> = {};
    for (const t of transformers) {
      const trigger = t.tag[t.tag.length - 1];
      (transformersByTrigger[trigger] ??= []).push(t);
    }

    // Same trigger chars the upstream composition-end gate uses: the typed
    // character has to plausibly close a markdown tag for us to even look.
    const triggerChars = new Set(Object.keys(transformersByTrigger));

    return editor.registerUpdateListener(({ tags, dirtyLeaves, editorState, prevEditorState }) => {
      // Ignore non-typing updates (remote edits, undo/redo).
      if (tags.has(COLLABORATION_TAG) || tags.has(HISTORIC_TAG)) return;
      // Wait until IME commit — backticks etc. mid-composition aren't real input.
      if (editor.isComposing()) return;
      const isCompositionEnd = tags.has(COMPOSITION_END_TAG);

      const selection = editorState.read(() => $getSelection());
      const prevSelection = prevEditorState.read(() => $getSelection());

      // Mirrors upstream MarkdownShortcuts: trigger only on collapsed range
      // selections that just moved (or that arrived via composition-end).
      if (
        !$isRangeSelection(prevSelection) ||
        !$isRangeSelection(selection) ||
        !selection.isCollapsed() ||
        (selection.is(prevSelection) && !isCompositionEnd)
      ) {
        return;
      }

      const anchorKey = selection.anchor.key;
      const anchorOffset = selection.anchor.offset;
      const anchorNode = editorState._nodeMap.get(anchorKey);

      // The anchor has to be a text node that was just edited. The
      // `anchorOffset !== 1 && anchorOffset > prev + 1` guard rejects
      // multi-char jumps (paste, programmatic moves) that aren't typing —
      // skipped for composition-end since IME commits can land >1 chars.
      if (
        !$isTextNode(anchorNode) ||
        !dirtyLeaves.has(anchorKey) ||
        (!isCompositionEnd && anchorOffset !== 1 && anchorOffset > prevSelection.anchor.offset + 1)
      ) {
        return;
      }

      // On composition-end, the committed char might be anything; only
      // proceed when it's a char that could close one of our tags.
      if (isCompositionEnd) {
        const closeChar = editorState.read(() => anchorNode.getTextContent())[anchorOffset - 1];
        if (!triggerChars.has(closeChar)) return;
      }

      editor.update(() => {
        // Code-formatted text doesn't take inline-markdown transformation
        // (CommonMark: code spans are opaque).
        if (anchorNode.hasFormat("code")) return;

        const parentNode = anchorNode.getParent();
        // Inside a fenced code block there's no Markdown formatting at all.
        if (parentNode === null || $isCodeNode(parentNode)) return;

        if ($runFixedTextFormatTransformers(anchorNode, anchorOffset, transformersByTrigger)) {
          // Same history hint upstream uses: push a separate undo step so
          // Cmd+Z reverts the format application as a single action.
          $addUpdateTag(HISTORY_PUSH_TAG);
        }
      });
    });
  }, [editor, transformers]);

  return null;
}

// Same shape as @lexical/markdown's `$runTextFormatTransformers`, with the
// format-application step replaced by a set-ON loop (see header).
function $runFixedTextFormatTransformers(
  anchorNode: TextNode,
  anchorOffset: number,
  transformersByTrigger: Record<string, ReadonlyArray<TextFormatTransformer>>,
): boolean {
  const textContent = anchorNode.getTextContent();
  const closeTagEndIndex = anchorOffset - 1;
  const closeChar = textContent[closeTagEndIndex];
  const matchers = transformersByTrigger[closeChar];
  if (!matchers) return false;

  for (const matcher of matchers) {
    const { tag } = matcher;
    const tagLength = tag.length;
    const closeTagStartIndex = closeTagEndIndex - tagLength + 1;

    // Multi-char tags (`**`, `~~`, `==`, `***`, `___`): verify the rest of
    // the closing tag matches before we go further.
    if (tagLength > 1) {
      if (!isEqualSubString(textContent, closeTagStartIndex, tag, 0, tagLength)) continue;
    }

    // ` ** ` (space right before the closing `**`) doesn't close a tag.
    if (textContent[closeTagStartIndex - 1] === " ") continue;

    // `intraword: false` tags (`__`, `_`, `___`) can't sit glued to a word
    // character after the close (`foo_bar_baz` shouldn't italicize "bar").
    const afterCloseTagChar = textContent[closeTagEndIndex + 1];
    if (
      matcher.intraword === false &&
      afterCloseTagChar &&
      !PUNCTUATION_OR_SPACE.test(afterCloseTagChar)
    ) {
      continue;
    }

    // Look for the opening tag — first in the close node, then walking back
    // through previous text-node siblings. Stops at a line break (different
    // line), and skips code-formatted text (a `**` inside `` `code` `` doesn't
    // open a tag).
    const closeNode = anchorNode;
    let openNode = closeNode;
    let openTagStartIndex = getOpenTagStartIndex(textContent, closeTagStartIndex, tag);
    let sibling: TextNode | null = openNode;

    while (openTagStartIndex < 0 && (sibling = sibling.getPreviousSibling<TextNode>())) {
      if ($isLineBreakNode(sibling)) break;
      if ($isTextNode(sibling)) {
        if (sibling.hasFormat("code")) continue;
        const siblingTextContent = sibling.getTextContent();
        openNode = sibling;
        openTagStartIndex = getOpenTagStartIndex(
          siblingTextContent,
          siblingTextContent.length,
          tag,
        );
      }
    }

    if (openTagStartIndex < 0) continue;

    // `****` (open and close tags touching, no content between) doesn't apply.
    if (openNode === closeNode && openTagStartIndex + tagLength === closeTagStartIndex) {
      continue;
    }

    const prevOpenNodeText = openNode.getTextContent();

    // Repeating-char disambiguation: `***...**` shouldn't be read as a `**`
    // pair when the char just before the open is the same as the close char
    // (the `*` belongs to a longer tag the caller will try next).
    if (openTagStartIndex > 0 && prevOpenNodeText[openTagStartIndex - 1] === closeChar) {
      continue;
    }

    // Intraword guard, opener side: same rule as the close side.
    const beforeOpenTagChar = prevOpenNodeText[openTagStartIndex - 1];
    if (
      matcher.intraword === false &&
      beforeOpenTagChar &&
      !PUNCTUATION_OR_SPACE.test(beforeOpenTagChar)
    ) {
      continue;
    }

    // CommonMark: code spans take precedence over other inline formatting.
    // Skip if we'd open the tag inside a still-unclosed `` ` `` run.
    if (
      !matcher.format.includes("code") &&
      $isInsideUnclosedCodeSpan(openNode, openTagStartIndex)
    ) {
      continue;
    }

    // Strip the closing tag first so the indices we computed against
    // `prevCloseNodeText` stay valid for the opening-tag strip below.
    const prevCloseNodeText = closeNode.getTextContent();
    const closeNodeText =
      prevCloseNodeText.slice(0, closeTagStartIndex) +
      prevCloseNodeText.slice(closeTagEndIndex + 1);
    closeNode.setTextContent(closeNodeText);
    const openNodeText = openNode === closeNode ? closeNodeText : prevOpenNodeText;
    openNode.setTextContent(
      openNodeText.slice(0, openTagStartIndex) + openNodeText.slice(openTagStartIndex + tagLength),
    );

    // Build a selection over the content that used to be between the tags so
    // we can apply the format to it.
    const selection = $getSelection();
    const nextSelection = $createRangeSelection();
    $setSelection(nextSelection);
    const newOffset = closeTagEndIndex - tagLength * (openNode === closeNode ? 2 : 1) + 1;
    nextSelection.anchor.set(openNode.__key, openTagStartIndex, "text");
    nextSelection.focus.set(closeNode.__key, newOffset, "text");

    // THE FIX vs upstream: turn each format ON across every formattable text
    // node in the matched range. Never toggle. If the range is already in the
    // target format, the markers are just consumed. Mirrors
    // `FormatFormattableTextPlugin`'s set-ON semantics — `extract()` splits
    // boundary nodes so partial-node selections format only the covered chars,
    // and the `$isFormattableTextNode` filter skips fenced-code text (which
    // the Markdown serializer would drop the format from anyway).
    for (const format of matcher.format) {
      for (const node of nextSelection.extract().filter($isFormattableTextNode)) {
        if (!node.hasFormat(format)) {
          node.toggleFormat(format);
        }
      }
    }

    // Park the caret right after the now-formatted content (cursor exits the
    // tag pair, ready for the user to keep typing).
    nextSelection.anchor.set(
      nextSelection.focus.key,
      nextSelection.focus.offset,
      nextSelection.focus.type,
    );

    // Restore the original pending format. We mutated text nodes directly
    // rather than calling `formatText`, so `nextSelection.format` is still 0;
    // copying the pre-shortcut pending format keeps any unrelated format the
    // user had toggled on (e.g. italic while a bold-star shortcut fires).
    if ($isRangeSelection(selection)) {
      nextSelection.format = selection.format;
    }

    return true;
  }

  return false;
}

// Same set as @lexical/markdown's PUNCTUATION_OR_SPACE — ASCII punctuation +
// any whitespace. Used by the intraword guards.
const PUNCTUATION_OR_SPACE = /[!-/:-@[-`{-~\s]/;

// CommonMark code-span precedence: count backticks before `offset`; an odd
// count means we're inside an unclosed `` ` `` and should not open another
// inline format here.
function $isInsideUnclosedCodeSpan(node: TextNode, offset: number): boolean {
  const text = node.getTextContent();
  let backtickCount = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "`") backtickCount++;
  }
  return backtickCount % 2 !== 0;
}

// Walk backward from `maxIndex` looking for the right-most occurrence of `tag`
// that doesn't have a space immediately after it (a space cancels the open).
function getOpenTagStartIndex(text: string, maxIndex: number, tag: string): number {
  const tagLength = tag.length;
  for (let i = maxIndex; i >= tagLength; i--) {
    const startIndex = i - tagLength;
    if (
      isEqualSubString(text, startIndex, tag, 0, tagLength) &&
      text[startIndex + tagLength] !== " "
    ) {
      return startIndex;
    }
  }
  return -1;
}

function isEqualSubString(
  stringA: string,
  aStart: number,
  stringB: string,
  bStart: number,
  length: number,
): boolean {
  for (let i = 0; i < length; i++) {
    if (stringA[aStart + i] !== stringB[bStart + i]) return false;
  }
  return true;
}
