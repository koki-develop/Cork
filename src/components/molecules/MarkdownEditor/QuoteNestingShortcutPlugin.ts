"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isQuoteNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isLineBreakNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COLLABORATION_TAG,
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
} from "lexical";
import { useEffect } from "react";

import {
  $absorbTrailingQuoteSibling,
  $createNestedQuoteChain,
  $mergeIntoQuoteTree,
} from "./transformers";

/**
 * Live conversion of `> ` (or `> > `, `> > > `, ...) typed at the start of a
 * paragraph INSIDE an existing QuoteNode into a deeper-nested QuoteNode.
 *
 * Required because `@lexical/markdown`'s `MarkdownShortcutPlugin` only runs
 * element transformers at the document root (`$runElementTransformers` bails
 * when the anchor's grandparent isn't `root`). So once the user creates a
 * depth-1 quote and presses Enter to start a new quote line, typing `> ` at
 * the start of that line never reaches the QUOTE regex — the marker would
 * stay as literal text inside the depth-1 quote, the user would think the
 * editor doesn't support nesting at all (the on-disk import path does, but
 * the typing path silently fails).
 *
 * Mirror of `CheckListShortcutPlugin`'s registerUpdateListener-with-history-
 * merge pattern (see that file's header for the two pause-related caveats —
 * same analysis applies here). On every non-historic, non-collab, non-self-
 * tagged update we read the freshly-committed state and look for a
 * ParagraphNode child of a QuoteNode whose FIRST child is a TextNode whose
 * content starts with `(>\s)+`. When matched, the rewrite is re-emitted with
 * `tag: HISTORY_MERGE_TAG, discrete: true` so the convert merges into the
 * just-typed space's history entry — Ctrl+Z reverts back to the state BEFORE
 * the `> ` was typed (avoiding the intermediate "paragraph containing literal
 * `> `" state that would re-trigger the convert on re-application).
 *
 * `depthIncrement` = number of `> ` repetitions in the leading match → adds
 * that many levels of nesting to the current paragraph's depth. Each typed
 * `> ` peels off one more level: typing `> ` once nests one deeper, typing
 * `> > ` (in one go before the first space fires) nests two deeper, etc.
 * Everything after the markers becomes the content of the new deepest
 * paragraph — and crucially, we MOVE the original children (not just their
 * text) so any inline format on the tail (bold/italic/code, links, etc.)
 * survives the conversion. The marker chars are stripped in place from the
 * leading TextNode, which becomes empty and is dropped; remaining siblings
 * carry their formatting flags into the new paragraph verbatim.
 *
 * Shape gate is intentionally looser than `CheckListShortcutPlugin`'s:
 *   - children > 1 is fine (formatted leading text node + plain tail, an
 *     existing inline link / code span after the marker, etc.)
 *   - a LineBreakNode anywhere in the paragraph DOES bail — a Shift+Enter
 *     soft break makes "tail" ambiguous (which visual line is the marker
 *     attached to?), and converting the whole paragraph would silently fold
 *     the post-break content into the new nested level.
 */
const QUOTE_NEST_MARKER_REGEX = /^((?:>\s)+)(.*)$/;

export function QuoteNestingShortcutPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ tags, dirtyLeaves, editorState }) => {
      // Skip undo/redo and remote-collab applies — those restore states we
      // already processed. Without this, Ctrl+Z to a quote-paragraph
      // containing literal `> ` would re-convert and make undo unreachable.
      if (tags.has(HISTORIC_TAG) || tags.has(COLLABORATION_TAG)) {
        return;
      }
      // Skip our own follow-up update.
      if (tags.has(HISTORY_MERGE_TAG)) {
        return;
      }
      // IME compositions commit their final character via composition events;
      // bail until composition ends.
      if (editor.isComposing()) {
        return;
      }
      // Cursor moves / pure selection changes never dirty a leaf, so a
      // marker-shaped paragraph can't have just appeared. Bail before
      // entering the read context — `editor.registerUpdateListener` fires on
      // every keystroke / arrow-key press, so this short-circuit cuts the
      // read-transaction overhead on a hot path.
      if (dirtyLeaves.size === 0) {
        return;
      }

      let target: { paragraphKey: string; tail: string; depthIncrement: number } | null = null;

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
        // user is on a quote line. Outside a quote, `MarkdownShortcutPlugin`
        // handles the `> ` → depth-1 quote conversion via the QUOTE element
        // transformer's regex on the document root.
        if (!$isQuoteNode(paragraph.getParent())) {
          return;
        }

        const children = paragraph.getChildren();
        // Soft-break (Shift+Enter) breaks the "marker belongs to the visual
        // line" relationship — bail rather than fold post-break content into
        // the new nested level.
        if (children.some($isLineBreakNode)) {
          return;
        }

        // The marker has to live in the FIRST text node and the anchor has
        // to BE that text node — otherwise the user typed somewhere other
        // than right after the marker, or the marker spans nodes, neither of
        // which is the typing-into-empty-line flow we're modeling.
        const firstChild = children[0];
        if (!$isTextNode(firstChild) || firstChild !== anchorNode) {
          return;
        }

        const match = firstChild.getTextContent().match(QUOTE_NEST_MARKER_REGEX);
        if (match === null) {
          return;
        }

        // depthIncrement = number of `> ` repetitions in the leading match.
        // Each `>\s` is exactly 2 chars (regex requires single whitespace).
        target = {
          paragraphKey: paragraph.getKey(),
          tail: match[2],
          depthIncrement: match[1].length / 2,
        };
      });

      if (target === null) {
        return;
      }

      const { paragraphKey, tail, depthIncrement } = target;

      // Merge with the previous history entry (the typing run that produced
      // the marker text) so the undo-stack target is the state BEFORE the
      // marker was typed — the user never sees the intermediate
      // "paragraph-with-literal-`> `" state on undo. `discrete: true` runs
      // the convert synchronously so that state never paints to a frame.
      editor.update(
        () => {
          const paragraph = $getNodeByKey(paragraphKey);
          if (!$isParagraphNode(paragraph)) {
            return;
          }

          const tailParagraph = $createParagraphNode();
          // Move the original children — formatting flags ride along on the
          // node references, so a bold / italic / coded tail survives the
          // conversion without us recreating TextNodes.
          tailParagraph.append(...paragraph.getChildren());
          const tailFirst = tailParagraph.getFirstChild();
          if ($isTextNode(tailFirst)) {
            // Strip the marker from the leading TextNode. If that leaves it
            // empty (the typing-into-empty-line flow, where there's no tail
            // beyond the marker), drop the empty node so the new paragraph
            // doesn't carry a stray zero-width text leaf.
            if (tail === "") {
              tailFirst.remove();
            } else {
              tailFirst.setTextContent(tail);
            }
          }

          // Mirror of the root-level QUOTE transformer's previous-is-quote
          // branch: when the typed paragraph already has a QuoteNode above it
          // inside the same parent, splice the new tail into that existing
          // QuoteNode (via `$mergeIntoQuoteTree`) instead of spawning a
          // sibling one. Without this the live editor would render two
          // adjacent same-depth blockquotes, while reopening the saved
          // Markdown (which round-trips through `$mergeIntoQuoteTree` on the
          // import side) would collapse them into a single one — see the
          // `> > bbb` + `> > ccc` case in `QuoteNestingShortcutPlugin.spec`.
          // `$absorbTrailingQuoteSibling` covers the symmetric case where a
          // QuoteNode also follows the typed paragraph.
          const previous = paragraph.getPreviousSibling();
          if ($isQuoteNode(previous)) {
            $mergeIntoQuoteTree(previous, tailParagraph, depthIncrement);
            paragraph.remove();
            $absorbTrailingQuoteSibling(previous);
            tailParagraph.selectStart();
            return;
          }

          const newChain = $createNestedQuoteChain(depthIncrement, tailParagraph);
          paragraph.replace(newChain);
          $absorbTrailingQuoteSibling(newChain);
          tailParagraph.selectStart();
        },
        { tag: HISTORY_MERGE_TAG, discrete: true },
      );
    });
  }, [editor]);

  return null;
}
