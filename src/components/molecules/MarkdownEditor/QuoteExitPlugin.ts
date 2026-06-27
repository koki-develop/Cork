"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createQuoteNode, $isQuoteNode, type QuoteNode } from "@lexical/rich-text";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import {
  $createParagraphNode,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  DELETE_LINE_COMMAND,
  DELETE_WORD_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
  type LexicalNode,
  type ParagraphNode,
} from "lexical";
import { useEffect } from "react";

/**
 * Two exit-from-quote channels: Enter on an empty trailing line, and
 * Backspace at the start of a quote line. Both run at COMMAND_PRIORITY_LOW
 * so they preempt the rich-text plugin's EDITOR-priority defaults (which
 * either keep extending the quote on Enter or fold the surrounding blocks
 * into the quote on Backspace — see the bug-by-bug breakdown below for what
 * each default does without us).
 *
 * The "Enter stays in the quote on a NON-empty line" half of the contract is
 * NOT a command override — it falls out of the QuoteNode > ParagraphNode
 * tree shape produced by the QUOTE transformer in `transformers.ts`.
 * `selection.insertParagraph()` walks up to the nearest block ancestor and
 * calls `insertNewAfter` on it; with the cursor inside a ParagraphNode child
 * of a QuoteNode that ancestor is the paragraph, so the default split
 * appends a sibling paragraph INSIDE the QuoteNode. This plugin only owns
 * the cases where the default would do the wrong thing.
 *
 * ## Enter
 *
 * Cursor in an empty ParagraphNode that is the LAST child of its QuoteNode
 * parent → outdent one level. We drop the empty paragraph and insert a fresh
 * paragraph as a sibling AFTER the parent QuoteNode via `insertAfter`. The
 * destination is wherever parent sits: for a nested QuoteNode the new
 * paragraph lands one level out (inside the surrounding QuoteNode); for a
 * top-level QuoteNode it lands at root. After the move, if parent is now
 * empty, prune it — and cascade up: a `> > ` + Enter Enter Enter sequence
 * on an otherwise-empty document would otherwise leave hollow nested
 * `<blockquote>` shells.
 *
 * ## Backspace
 *
 * Cursor at the very start of a paragraph in a QuoteNode (collapsed
 * selection, anchor.offset === 0, and the anchor sits in the paragraph's
 * first leaf). Two branches by paragraph position:
 *
 *   - **Empty AND last child**: same outcome as the Enter case — exit
 *     downward, paragraph after parent. Without this, Lexical's default
 *     Backspace merges the empty paragraph INTO the previous quote line
 *     (`> aaa\n> |` → `> aaa|`), reading as "the empty trailing line silently
 *     deleted itself with the caret jumping back into the previous line",
 *     which is not how every other markdown editor exits a quote on backspace.
 *
 *   - **First child**: unwrap upward — move the paragraph BEFORE parent at
 *     the grandparent level, then prune parent if it emptied. Without this,
 *     two failure modes hit at once: (a) the default merges across the
 *     QuoteNode boundary into whatever block precedes the quote, so
 *     `> aaa\n\n> |bbb` (two adjacent quotes separated by a blank line)
 *     collapses into a single `> aaa|bbb` quote with the blank gone — content
 *     and structure both mangled. (b) for a single-paragraph quote (`> |aaa`),
 *     the default routes through `QuoteNode.collapseAtStart`, which creates
 *     a NEW ParagraphNode and re-parents the inner ParagraphNode (the only
 *     QuoteNode child) into it — producing `ParagraphNode > ParagraphNode >
 *     TextNode`. That nested-paragraph shape silently breaks
 *     `MarkdownShortcutPlugin`'s "grandparent must be root, parent's first
 *     child must be a TextNode" gate: typing `> ` after that point never
 *     re-triggers the QUOTE shortcut, so the user thinks quote authoring
 *     stopped working until they reopen the dialog. Doing the unwrap
 *     manually keeps the tree flat: the inner paragraph is detached from the
 *     QuoteNode and inserted directly under the QuoteNode's parent — exactly
 *     the shape the live shortcut expects.
 *
 * Non-empty, non-first quote paragraph + cursor-at-start Backspace falls
 * through to default behavior (joins with the previous quote line, which is
 * what every editor does for backspace-into-previous-line within a block).
 */
export function QuoteExitPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        INSERT_PARAGRAPH_COMMAND,
        () => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return false;
          }

          const paragraph = $findMatchingParent(selection.anchor.getNode(), $isParagraphNode);
          if (paragraph == null) {
            return false;
          }
          const parent = paragraph.getParent();
          if (!$isQuoteNode(parent)) {
            return false;
          }

          // Empty trailing line only — mid-quote empty paragraphs keep the
          // default split (pressing Enter there extends the gap, same as a
          // non-trailing empty paragraph at root).
          if (paragraph.getTextContent() !== "" || parent.getLastChild() !== paragraph) {
            return false;
          }

          $exitAfter(parent, paragraph);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          if (!$tryExitQuoteAtStart()) {
            return false;
          }
          // KEY_BACKSPACE_COMMAND is dispatched from `onKeyDown` without an
          // upstream preventDefault — the browser's native backspace would
          // still fire and race the Lexical update through the mutation
          // observer if we didn't suppress it here.
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      // Cmd+Backspace (macOS delete-line-backward) and Option+Backspace
      // (delete-word-backward) both route through their own commands rather
      // than `KEY_BACKSPACE_COMMAND`, so without these registrations the
      // default delete-line / delete-word handler at `EDITOR` priority falls
      // through to `QuoteNode.collapseAtStart` for the single-paragraph-quote
      // case — the same re-parenting bug that breaks the live `> ` shortcut.
      // Lexical's beforeinput / onKeyDown handlers both call
      // `event.preventDefault()` BEFORE dispatching these commands, so
      // returning true here is enough; no manual preventDefault from us.
      editor.registerCommand<boolean>(
        DELETE_LINE_COMMAND,
        (isBackward) => isBackward && $tryExitQuoteAtStart(),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<boolean>(
        DELETE_WORD_COMMAND,
        (isBackward) => isBackward && $tryExitQuoteAtStart(),
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  return null;
}

// Drop the empty paragraph and place a fresh paragraph AS A SIBLING after
// `parent`. For a nested QuoteNode the new paragraph lands one level out;
// for a top-level QuoteNode it lands at root. If `parent` emptied as a side
// effect, prune it and cascade up through any QuoteNode grandparents that
// emptied too.
function $exitAfter(parent: QuoteNode, paragraph: ParagraphNode): void {
  paragraph.remove();
  const exit = $createParagraphNode();
  parent.insertAfter(exit);
  $pruneEmptyQuoteAncestors(parent);
  exit.select(0, 0);
}

// Move the paragraph BEFORE `parent` at the grandparent level — the caret
// stays in the same paragraph node (preserving any text content), but the
// node is now outside the QuoteNode. If `parent` is empty after the move
// (the unwrap pulled out its only child), prune it; cascade up.
function $unwrapBefore(parent: QuoteNode, paragraph: ParagraphNode): void {
  parent.insertBefore(paragraph);
  $pruneEmptyQuoteAncestors(parent);
  paragraph.selectStart();
}

// Eat one `> ` marker off the cursor's quote line by extracting `paragraph`
// out of `parent` to the grandparent level and splitting `parent`'s
// trailing children (everything AFTER paragraph in document order) into a
// fresh QuoteNode that sits after the extracted paragraph. The caret lands
// at the start of the extracted paragraph — semantically "your line just
// lost its quote marker; you're now writing at the level above".
//
// Callers guarantee `paragraph` has at least one previous sibling inside
// parent (the `!isFirst` gate). Trailing siblings are optional: when
// absent, no new QuoteNode is created and `parent` keeps its leading
// siblings only.
//
// Tree shapes the four call paths produce:
//
//   empty-trailing       `> aaa\n> |`              → parent: [P "aaa"], P (empty, cursor)
//   non-empty-trailing   `> aaa\n> |bbb`           → parent: [P "aaa"], P "bbb" (cursor)
//   empty-mid            `> aaa\n> |\n> bbb`       → parent: [P "aaa"], P (empty, cursor), newQuote: [P "bbb"]
//   non-empty-mid        `> aaa\n> |bbb\n> ccc`    → parent: [P "aaa"], P "bbb" (cursor), newQuote: [P "ccc"]
//
// All four collapse to one helper once `isEmpty` / `isLast` stop being
// treated as orthogonal dimensions — the only branch left is "are there
// trailing siblings or not?", and that's a structural question, not a
// content-shape one.
function $extractParagraphDownward(parent: QuoteNode, paragraph: ParagraphNode): void {
  // Snapshot the trailing siblings BEFORE the remove + insertAfter steps —
  // a live `getNextSiblings()` walk would shift mid-iteration once the
  // next inserts re-parent the nodes.
  const trailing = paragraph.getNextSiblings();
  paragraph.remove();
  if (trailing.length > 0) {
    const newQuote = $createQuoteNode();
    newQuote.append(...trailing);
    parent.insertAfter(newQuote);
  }
  // Insert `paragraph` AFTER the trailing-split insertion: since
  // `insertAfter` always lands the new node immediately after its receiver,
  // doing newQuote first then paragraph keeps the final order
  // `parent → paragraph → newQuote`. Without `newQuote` the call still
  // does the right thing — paragraph just lands right after parent.
  parent.insertAfter(paragraph);
  paragraph.selectStart();
}

// Shared body of every backward-delete command we own (KEY_BACKSPACE,
// DELETE_LINE backward, DELETE_WORD backward). Detects "caret at the very
// start of a paragraph that's structurally relevant to the quote model"
// and dispatches one of the three rewrites (B-join, B-first unwrap, B-
// extract). Returns true on a rewrite so the caller can stop default
// propagation; false otherwise so the default delete handler runs.
//
// All three commands share the SAME structural decision — the only thing
// they vary on (Backspace at end of word vs delete-line) is the SCOPE of
// what would otherwise get deleted, and that scope is irrelevant once the
// caret is at offset 0 of a line (nothing to delete within the line; the
// effect is purely structural). So sharing the body means all three keys
// produce the same quote-exit behavior, which matches user expectations
// across markdown editors.
function $tryExitQuoteAtStart(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }
  // anchor.offset === 0 alone isn't enough — the cursor at offset 0 of an
  // ElementNode's third text child still has prior siblings we'd be
  // skipping over. Confirm the anchor leaf is the paragraph's first
  // descendant; only then is "caret at the start of the line" the intent.
  if (selection.anchor.offset !== 0) {
    return false;
  }
  const paragraph = $findMatchingParent(selection.anchor.getNode(), $isParagraphNode);
  if (paragraph == null) {
    return false;
  }
  const firstLeaf = paragraph.getFirstDescendant();
  const anchorNode = selection.anchor.getNode();
  if (firstLeaf !== anchorNode && firstLeaf !== null) {
    return false;
  }
  const isEmpty = paragraph.getTextContent() === "";
  const parent = paragraph.getParent();
  if (!$isQuoteNode(parent)) {
    // (B-join) Cursor on an empty paragraph SANDWICHED between two
    // QuoteNodes at the same parent level (typically root after the
    // spacer pass has restored a saved `> aaa\n\n> bbb` to its authored
    // shape). Join the two quotes: trailing children move into the
    // leading one, spacer paragraph and emptied trailing quote both go
    // away, caret lands at the end of the leading quote's original last
    // paragraph (snapshotted BEFORE the move so it points to the user's
    // `aaa` end, not the freshly-appended `bbb` end).
    if (isEmpty) {
      const previous = paragraph.getPreviousSibling();
      const next = paragraph.getNextSibling();
      if ($isQuoteNode(previous) && $isQuoteNode(next)) {
        $joinAdjacentQuotes(previous, paragraph, next);
        return true;
      }
    }
    return false;
  }
  // Unified "eat one `> ` marker off the cursor's line" semantics.
  //   - First child → unwrap upward (cursor's line escapes BEFORE its
  //     parent QuoteNode; trailing siblings stay inside). Also sidesteps
  //     the default `collapseAtStart` re-parenting bug — wrapping the
  //     inner paragraph in another paragraph would break the live `> `
  //     shortcut afterwards.
  //   - Non-first → extract downward (cursor's line escapes AFTER its
  //     parent QuoteNode; trailing siblings, if any, get re-parented
  //     into a fresh QuoteNode that follows the extracted paragraph).
  const isFirst = parent.getFirstChild() === paragraph;
  if (isFirst) {
    $unwrapBefore(parent, paragraph);
  } else {
    $extractParagraphDownward(parent, paragraph);
  }
  return true;
}

// Concatenate `next`'s children onto the end of `prev`, drop the empty
// spacer paragraph between them and the now-empty `next` shell, and park
// the caret at the end of `prev`'s original last paragraph — the place
// the user would naturally continue typing after re-joining the two
// quotes. `cursorTarget` is captured BEFORE the move; it stays attached
// (it's still inside `prev`) but isn't `prev`'s last child anymore, which
// is fine — `selectEnd` on it lands at the end of `aaa` rather than at
// the end of the freshly-appended `bbb`, matching the user's "rejoin"
// expectation.
function $joinAdjacentQuotes(prev: QuoteNode, spacer: ParagraphNode, next: QuoteNode): void {
  const cursorTarget = prev.getLastChild();
  prev.append(...next.getChildren());
  spacer.remove();
  next.remove();
  if ($isElementNode(cursorTarget)) {
    cursorTarget.selectEnd();
  } else {
    prev.selectEnd();
  }
}

function $pruneEmptyQuoteAncestors(quote: QuoteNode): void {
  let cur: QuoteNode | null = quote;
  while (cur != null && cur.getChildrenSize() === 0) {
    const parent: LexicalNode | null = cur.getParent();
    cur.remove();
    cur = $isQuoteNode(parent) ? parent : null;
  }
}
