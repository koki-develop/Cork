"use client";

import { $createCodeNode } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isQuoteNode } from "@lexical/rich-text";
import { mergeRegister } from "@lexical/utils";
import {
  $getNodeByKey,
  $getSelection,
  $isLineBreakNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $setState,
  COLLABORATION_TAG,
  COMMAND_PRIORITY_LOW,
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
  KEY_ENTER_COMMAND,
  type ParagraphNode,
} from "lexical";
import { useEffect } from "react";

import { corkCodeFenceState } from "./transformers";

/**
 * Live conversion of a fenced-code opener (```` ``` ````, optionally followed
 * by a language) typed at the start of a paragraph INSIDE an existing
 * QuoteNode into a real CodeNode, nested inside that same QuoteNode.
 *
 * Required for the same structural reason `QuoteNestingShortcutPlugin`
 * exists: `@lexical/markdown`'s `MarkdownShortcutPlugin` only runs (multiline
 * included) element transformers when the paragraph being edited is a direct
 * child of the document root (`runMultilineElementTransformers` bails when
 * the anchor paragraph's OWN parent isn't root/shadow-root) — so the CODE
 * transformer's own live-typing shortcut can never reach a paragraph whose
 * parent is a QuoteNode. QUOTE_CODE in transformers.ts covers the file-load /
 * paste import path; this plugin is its live-typing counterpart.
 *
 * Two independent trigger paths, mirroring upstream's OWN two ways of
 * committing the root-level CODE shortcut (`registerMarkdownShortcuts` in
 * `@lexical/markdown`):
 *
 *   1. **Trailing space/tab** (`registerUpdateListener` below, mirrors
 *      `QuoteNestingShortcutPlugin`'s pattern) — fires once the paragraph's
 *      committed text is EXACTLY the fence (+ optional language) followed by
 *      one trailing space/tab. The trailing separator is load-bearing here:
 *      without requiring it, the regex would also match a still-in-progress
 *      language (e.g. "```j" while typing "```js") and convert prematurely,
 *      cutting the user off mid-word.
 *   2. **Enter** (`KEY_ENTER_COMMAND` below) — upstream's own root-level path
 *      converts on Enter with NO trailing space required (see
 *      `runMultilineElementTransformers(..., true)` inside upstream's
 *      `KEY_ENTER_COMMAND` handler — passing `triggerOnEnter: true` skips the
 *      trailing-space gate entirely). Typing ```` ``` ```` then immediately
 *      pressing Enter — arguably the MORE common gesture, and the one a
 *      user reasonably expects to work — is exactly this case. Without this
 *      second path, a fence typed inside a quote and immediately followed by
 *      Enter would stay literal text forever (Enter just starts a new quote
 *      line), which is the bug this half of the plugin fixes. Registered at
 *      `COMMAND_PRIORITY_LOW`, same as upstream's own Enter handler — same-
 *      priority listeners run in registration order, and `MarkdownShortcutPlugin`
 *      (mounted earlier in `MarkdownEditor.tsx`) always declines first here
 *      (its own root-parent gate fails for a quote-nested paragraph), so
 *      there's no double-handling.
 *
 * Both paths share `$convertQuoteParagraphToCode` for the actual mutation and
 * require the SAME shape gate: the paragraph must be a direct child of a
 * QuoteNode, and its entire content must be a single TextNode (no
 * LineBreakNode — a Shift+Enter soft break makes "is this just a fence
 * marker" ambiguous, mirroring `QuoteNestingShortcutPlugin`'s identical
 * bail). There is no "tail content to preserve" the way `QuoteNestingShortcutPlugin`
 * has one for `> ` — a fenced-code opener consumes the entire line by
 * definition, so the matched paragraph is simply replaced outright with a
 * fresh, empty CodeNode.
 */
const QUOTE_CODE_SPACE_TRIGGER_REGEX = /^(`{3,})([\w-]*)[ \t]$/;
const QUOTE_CODE_ENTER_TRIGGER_REGEX = /^(`{3,})([\w-]*)$/;

function $convertQuoteParagraphToCode(
  paragraph: ParagraphNode,
  fence: string,
  language: string | undefined,
): void {
  const codeNode = $createCodeNode(language);
  // Preserve the fence width the user actually typed (3+ backticks) —
  // without this, `corkCodeFenceState`'s parser default silently normalizes
  // any widened live-typed fence down to 3 on save, out of step with
  // QUOTE_CODE's own file-load path.
  $setState(codeNode, corkCodeFenceState, fence);
  paragraph.replace(codeNode);
  codeNode.selectStart();
}

export function QuoteCodeShortcutPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ tags, dirtyLeaves, editorState }) => {
        // Skip undo/redo and remote-collab applies — those restore states we
        // already processed. Without this, Ctrl+Z to a quote-paragraph
        // containing literal fence text would re-convert and make undo
        // unreachable.
        if (tags.has(HISTORIC_TAG) || tags.has(COLLABORATION_TAG)) {
          return;
        }
        // Skip our own follow-up update.
        if (tags.has(HISTORY_MERGE_TAG)) {
          return;
        }
        // IME compositions commit their final character via composition
        // events; bail until composition ends.
        if (editor.isComposing()) {
          return;
        }
        // Cursor moves / pure selection changes never dirty a leaf, so a
        // marker-shaped paragraph can't have just appeared. Bail before
        // entering the read context — this listener fires on every
        // keystroke / arrow-key press, so this short-circuit cuts the
        // read-transaction overhead on a hot path.
        if (dirtyLeaves.size === 0) {
          return;
        }

        let target: { paragraphKey: string; fence: string; language: string | undefined } | null =
          null;

        editorState.read(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel) || !sel.isCollapsed()) {
            return;
          }

          const anchorKey = sel.anchor.key;
          if (!dirtyLeaves.has(anchorKey)) {
            return;
          }

          const anchorNode = sel.anchor.getNode();
          if (!$isTextNode(anchorNode)) {
            return;
          }

          const paragraph = anchorNode.getParent();
          if (!$isParagraphNode(paragraph)) {
            return;
          }

          // The paragraph must be a direct child of a QuoteNode — i.e. the
          // user is on a quote line. Outside a quote, upstream's own CODE
          // transformer already handles the fence-opener shortcut via the
          // document-root path.
          if (!$isQuoteNode(paragraph.getParent())) {
            return;
          }

          const children = paragraph.getChildren();
          // A fenced-code opener has to be the paragraph's ENTIRE content —
          // a LineBreakNode (Shift+Enter) or more than one child means the
          // marker isn't the whole line, so this isn't the "start a code
          // block" gesture.
          if (children.length !== 1 || children.some($isLineBreakNode)) {
            return;
          }

          const firstChild = children[0];
          if (!$isTextNode(firstChild) || firstChild !== anchorNode) {
            return;
          }

          const match = firstChild.getTextContent().match(QUOTE_CODE_SPACE_TRIGGER_REGEX);
          if (match === null) {
            return;
          }

          target = {
            paragraphKey: paragraph.getKey(),
            fence: match[1],
            language: match[2] || undefined,
          };
        });

        if (target === null) {
          return;
        }

        const { paragraphKey, fence, language } = target;

        // Merge with the previous history entry (the typing run that
        // produced the marker text) so the undo-stack target is the state
        // BEFORE the marker was typed — the user never sees the
        // intermediate "paragraph-with-literal-fence-text" state on undo.
        // `discrete: true` runs the convert synchronously so that state
        // never paints to a frame.
        editor.update(
          () => {
            const paragraph = $getNodeByKey(paragraphKey);
            if (!$isParagraphNode(paragraph)) {
              return;
            }
            $convertQuoteParagraphToCode(paragraph, fence, language);
          },
          { tag: HISTORY_MERGE_TAG, discrete: true },
        );
      }),
      editor.registerCommand<KeyboardEvent | null>(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event != null && event.shiftKey) {
            return false;
          }

          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return false;
          }

          const anchorNode = selection.anchor.getNode();
          if (!$isTextNode(anchorNode)) {
            return false;
          }

          const paragraph = anchorNode.getParent();
          if (!$isParagraphNode(paragraph)) {
            return false;
          }
          if (!$isQuoteNode(paragraph.getParent())) {
            return false;
          }

          const children = paragraph.getChildren();
          if (
            children.length !== 1 ||
            children.some($isLineBreakNode) ||
            children[0] !== anchorNode
          ) {
            return false;
          }

          const textContent = anchorNode.getTextContent();
          if (selection.anchor.offset !== textContent.length) {
            return false;
          }

          const match = textContent.match(QUOTE_CODE_ENTER_TRIGGER_REGEX);
          if (match === null) {
            return false;
          }

          event?.preventDefault();
          $convertQuoteParagraphToCode(paragraph, match[1], match[2] || undefined);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  return null;
}
