import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COLLABORATION_TAG,
  COMPOSITION_END_TAG,
  type EditorState,
  HISTORIC_TAG,
  type Point,
  type RangeSelection,
  type TextFormatType,
  type TextNode,
} from "lexical";
import { useEffect } from "react";

import { $isFormattableTextNode } from "./codeBlock";
import { ATOMIC_TEXT_FORMATS } from "./transformers";

// Keeps `RangeSelection.format`'s bits for every format in
// `ATOMIC_TEXT_FORMATS` (see that constant's header in `transformers.ts` for
// why `code`/`highlight` are the atomic set) synchronized with whether the
// collapsed caret actually sits INSIDE a run of that format — i.e. the
// character immediately to the LEFT of the caret and the character
// immediately to the RIGHT of the caret are both inside a same-formatted,
// non-fenced TextNode.
//
// The problem: `RangeSelection.format` is a persistent "pending format" field
// used by `selection.insertText` to decide the format of newly-inserted
// characters. When the caret lands on (or crosses into) a formatted
// TextNode, Lexical's `$internalCreateRangeSelection` reads the format off
// that node and stamps it onto `selection.format` — and NOTHING resets it once
// the caret leaves the run. So opening a task with body `` `a` `` (or
// `==a==`), then typing "b", extends the span to `` `ab` `` / `==ab==` — even
// though the caret was AT THE END of the content, not inside it. Same for
// pressing Enter (the new paragraph inherits the pending bit) and for
// deleting all text (the empty paragraph still carries a pending bit that the
// next typed char picks up).
//
// Fenced code blocks are ruled out at the leaf: `$isFormattableTextNode`
// returns false for any TextNode with a `CodeNode` ancestor (see
// `codeBlock.ts`), so a caret inside a fenced block always reads as "not
// inside a boundary-strict run" without a separate structural guard.
//
// Skipped update tags: COLLABORATION_TAG (peer is authoritative), HISTORIC_TAG
// (undo/redo restores the prior selection exactly — reflipping would push a
// new history entry that Ctrl+Y silently redoes to instead of the user's
// original text), COMPOSITION_END_TAG (IME commit; runs alongside
// FormatShortcutPlugin's shortcut scan on the same commit, so touching the
// format there would race with its `nextSelection.format = selection.format`
// restoration). Composition proper is guarded via `editor.isComposing()`.
//
// Early-out: skip commits where NOTHING that could change the answer
// happened — no node was added/removed/edited (`dirtyElements`/`dirtyLeaves`
// both empty) AND neither the caret's position nor its `ATOMIC_TEXT_FORMATS`
// bits changed since the previous commit (see `$readCollapsedSelectionKey`'s
// header for why BOTH have to be compared, not just position). This is
// deliberately NOT the `dirtyLeaves.has(anchorKey)` gate `CheckListShortcutPlugin`/
// `FormatShortcutPlugin` use elsewhere in this directory — that gate would be
// WRONG here. A pure caret move (arrow key, click) leaves `dirtyElements`/
// `dirtyLeaves` empty but DOES change which TextNode
// `$internalCreateRangeSelection` reads the pending format from, and that
// mismatch has to be corrected on arrival: `selection.insertText` reads
// `this.format` as of the PRECEDING commit, not freshly at typing time — so
// if the caret's own arrival at a boundary were skipped, the very next
// keystroke would already read the pre-correction (wrong) pending bit and
// bake the mistake into the newly-typed character before this listener ever
// got a chance to react.
//
// Termination: our own follow-up `editor.update` re-fires the listener, but
// with every bit now coherent, the mismatch list is empty on the second pass
// so we early-return before scheduling another commit. Tag-based skip is not
// used deliberately: our follow-up only mutates `selection.format` (dirty
// selection, not dirty tree), and Lexical only clears `editor._updateTags`
// on tree-dirty commits (LexicalUpdates.ts:624-631) — a tag on our commit
// would leak into the caller's next `editor.update` call.
export function BoundaryStrictFormatPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(
      ({ editorState, prevEditorState, tags, dirtyElements, dirtyLeaves }) => {
        if (
          tags.has(COLLABORATION_TAG) ||
          tags.has(HISTORIC_TAG) ||
          tags.has(COMPOSITION_END_TAG)
        ) {
          return;
        }
        if (editor.isComposing()) return;

        if (
          dirtyElements.size === 0 &&
          dirtyLeaves.size === 0 &&
          $readCollapsedSelectionKey(editorState) === $readCollapsedSelectionKey(prevEditorState)
        ) {
          return;
        }

        const mismatched = editorState.read((): TextFormatType[] => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return [];
          return ATOMIC_TEXT_FORMATS.filter(
            (format) => selection.hasFormat(format) !== $isCaretInsideFormat(selection, format),
          );
        });

        if (mismatched.length === 0) return;

        editor.update(
          () => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
            for (const format of mismatched) {
              selection.toggleFormat(format);
            }
          },
          { discrete: true },
        );
      },
    );
  }, [editor]);

  return null;
}

// A stable identity for the collapsed caret's position AND its
// `ATOMIC_TEXT_FORMATS` bits in `state`, or `null` if the selection isn't a
// collapsed RangeSelection. The early-out above skips a commit only when this
// key is unchanged from the previous commit (with no dirty nodes either) —
// deliberately including the format bits, not just the position: Lexical
// reseeds `pendingEditorState._selection` from a fresh DOM-selection
// resolution at the START of every non-nested `editor.update()` call in a
// mounted (non-headless) editor (`LexicalUpdates.ts`'s `$beginUpdate`, the
// `editorStateWasCloned` branch), independent of whatever the update callback
// itself does. That resolution can land on a "different anchor key than the
// last commit" internal branch and re-derive `format` from the neighbouring
// TextNode even when the caret's own final position doesn't move — so a
// position-only comparison would miss exactly the commit that most needs
// checking. Comparing the format bits too means ANY change relevant to
// `$isCaretInsideFormat`'s answer (a moved caret, OR a same-position format
// reseed) is caught, while a truly no-op commit (same position, same bits,
// nothing dirtied) is still skipped.
function $readCollapsedSelectionKey(state: EditorState): string | null {
  return state.read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
    const formatKey = ATOMIC_TEXT_FORMATS.map((format) => selection.hasFormat(format)).join(",");
    return `${selection.anchor.type}:${selection.anchor.key}:${selection.anchor.offset}:${formatKey}`;
  });
}

// Is the collapsed caret positioned so that inserting a character here would
// land INSIDE a run of `format`? True iff the character to the LEFT of the
// caret and the character to the RIGHT of the caret both live in a
// formattable (non-fenced) TextNode that carries `format`. A caret with
// nothing on either side, or with a differently-formatted character on either
// side, is treated as OUTSIDE — matching the exact-substring semantics of a
// Markdown delimiter pair.
//
// Deriving from "what's on each side" instead of "what does the anchor node
// itself carry" is what handles a zero-length splitter TextNode between two
// same-formatted siblings correctly: the splitter has no format bits of its
// own, but the neighbours on both sides do, so the caret is inside.
function $isCaretInsideFormat(selection: RangeSelection, format: TextFormatType): boolean {
  const left = $adjacentFormattableText(selection.anchor, "left");
  if (left == null || !left.hasFormat(format)) return false;
  const right = $adjacentFormattableText(selection.anchor, "right");
  return right != null && right.hasFormat(format);
}

// The formattable TextNode holding the character IMMEDIATELY on the given side
// of the caret, or `null` if that side has no formattable text (empty side,
// non-TextNode neighbour, or the neighbour is inside a fenced code block).
//
// Only the text-anchor case does real traversal: if the caret has room on the
// given side WITHIN the anchor node's own content, the character on that side
// belongs to the anchor node itself; otherwise (caret at the anchor node's
// boundary), the character belongs to the corresponding sibling.
//
// An element-anchor (the Point references a paragraph + child index, not a
// TextNode + offset — reached e.g. after backspacing a paragraph's only
// character away) always returns `null` here, deliberately WITHOUT walking
// `getChildAtIndex`. This isn't a shortcut that skips a real case: verified
// empirically (in a mounted, non-headless editor — the only way this plugin
// ever runs) that Lexical itself normalizes an element-anchor sitting between
// two TextNode children into the equivalent, more specific text-anchor before
// any `registerUpdateListener` observes it. So the only element-anchor
// positions this function can ever actually be called with are the two
// paragraph BOUNDARIES (offset 0, or offset === childrenCount) — and at a true
// boundary, the side facing outside the paragraph structurally has nothing to
// find regardless of which child is on the other side. `$isCaretInsideFormat`
// requires BOTH sides to resolve to a same-formatted TextNode to return `true`,
// so an element-anchor can never make it return anything but `false` — a
// child-index traversal here would be unreachable dead code, checked and
// exercised only via zero-vs-zero comparisons no test could ever tell apart
// from this direct `null`.
function $adjacentFormattableText(anchor: Point, side: "left" | "right"): TextNode | null {
  if (anchor.type !== "text") return null;
  const node = anchor.getNode();
  if (!$isFormattableTextNode(node)) return null;
  const offset = anchor.offset;
  const size = node.getTextContentSize();
  const insideNode = side === "left" ? offset > 0 : offset < size;
  if (insideNode) return node;
  const sibling = side === "left" ? node.getPreviousSibling() : node.getNextSibling();
  return $isFormattableTextNode(sibling) ? sibling : null;
}
