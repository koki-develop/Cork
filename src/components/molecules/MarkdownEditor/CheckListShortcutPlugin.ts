import { $createListItemNode, $isListItemNode, $isListNode, ListItemNode } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $copyNode,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COLLABORATION_TAG,
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
} from "lexical";
import { useEffect } from "react";

// Live conversion from `- ` + `[ ] ` (typed sequentially) into a check list.
// Required because `@lexical/markdown`'s `MarkdownShortcutPlugin` only runs
// its element transformers at the document root (`$runElementTransformers`
// bails when the anchor's grandparent isn't `root`), so a `[ ] ` typed inside
// an already-created bullet item never reaches the `CHECK_LIST` regex —
// upstream's shortcut path is unreachable from inside a list. Without this
// plugin the editor shows the half-converted state (`- ` made a bullet, the
// `[ ] foo` text stays literal in the listitem), and saving + reloading
// silently rewrites to a check list via the file's `- [ ] foo` line, so the
// visible structure flips between edits — the very inconsistency this plugin
// exists to kill.
//
// Approach: hook `registerUpdateListener` (the post-state-change phase) and
// detect a bullet listitem whose sole child TextNode is currently exactly
// `[ ] ` / `[x] ` / `[X] ` (4 chars, INCLUDING the trailing space). When the
// match fires we do the rewrite in a follow-up `editor.update(...)` tagged
// with `HISTORY_MERGE_TAG`, which tells the history plugin to merge the
// rewrite into the immediately preceding history entry (the space-insertion
// that produced the `[ ] ` text) instead of pushing a new one. So the
// undo-stack target for the next Ctrl+Z is whatever was current right BEFORE
// the space was typed — never the `[ ] ` (trailing-space) state itself. That
// state, if it survived undo, would serialize as `- [ ] ` and `STRICT_CHECK_LIST`
// would match it on reload, flipping bullet → check across save/reload — the
// exact inconsistency this plugin exists to kill.
//
// Two caveats on the undo target:
//
//   - If the user paused past lexical-history's merge-delay (default 300ms)
//     between typing `]` and ` `, the prior `[ ]` (3 chars, NO trailing space)
//     state was already pushed as its own history entry before the space
//     update arrived. Ctrl+Z then lands on `[ ]` (3 chars). This is still
//     safe: `- [ ]` doesn't match `STRICT_CHECK_LIST` (the regex requires
//     `\s` AFTER the closing `]`) so the file reloads as a bullet item with
//     literal text `[ ]`, matching what the editor shows. Lockstep preserved.
//
//   - Within the merge-delay window, the entire typing run (`[`, ` `, `]`, ` `)
//     coalesces into one entry; Ctrl+Z reverts the run plus the convert.
//
// We tried `KEY_SPACE_COMMAND` + `event.preventDefault()` first — converting
// before the space ever inserted, so the bullet's text never reached `[ ] `.
// In principle that's the cleanest design. In practice it didn't fire: the
// keydown-priority + browser preventDefault path through `dispatchCommand`
// → `$handleKeyDown` → KEY_SPACE_COMMAND wasn't intercepting the space
// insertion reliably (the space landed in the editor anyway), so the typing
// flow never converted at all. The update-listener path always runs post-
// state-change, so we trade preemption for guaranteed observability.
//
// A node-transform alternative (registerNodeTransform on ListItemNode) ALSO
// fails: transforms run on `HISTORIC` undo too, so any Ctrl+Z restoring a
// bullet-with-`[ ] ` state would immediately re-convert it, making undo
// unreachable. The update listener has an explicit `tags.has(HISTORIC_TAG)`
// short-circuit; transforms do not.
//
// Trigger shape: a bullet `ListItemNode` whose children are exactly ONE
// `TextNode` whose content STARTS WITH `[ ] ` / `[x] ` / `[X] ` (matched via
// `/^\[([ xX])\] (.*)$/`), AND that TextNode is the leaf the current update
// dirtied. The trailing capture (`.*`) lets the trigger fire when the user
// inserts the marker INTO existing text (e.g. caret at start of `aaa`,
// types `[ ] ` → text becomes `[ ] aaa` → convert preserves `aaa`) — not
// just the empty-bullet typing flow. The dirty-leaf gate ensures pure caret
// moves (which don't dirty leaves) never fire the convert. The shape gate
// makes the rewrite safe to apply unconditionally — an item with multiple
// children (inline link / code span / `LineBreakNode` from Shift+Enter)
// bails. There is intentionally NO format gate: the marker's 4 chars are
// dropped from the text (the remainder, if any, is preserved verbatim on
// the new check item), so a marker typed with bold / italic active still
// converts cleanly — no content is lost.
//
// Why prefix matching is safe under Ctrl+Z (re-convert concern): if the
// user undoes the convert, HISTORY_MERGE_TAG ensures the undo target is
// the state BEFORE the typing run started — `aaa` (bullet, no marker
// chars). Subsequent typing of any non-marker character produces text
// that doesn't match `^\[([ xX])\] ` — no re-convert. The only way to
// re-trigger is to re-type the marker, which is what the user would have
// to do intentionally.
//
// Conversion has three shapes by where bulletItem lives:
//
//   1. Only item in its list (top-level OR nested): replace parentList in
//      place. The wrapping context (root or a wrapping LI) keeps the same
//      structural slot, just with a check ListNode instead of a bullet one.
//
//   2. Top-level with siblings: split parentList — insertAfter the check
//      list, then `$copyNode(parentList)` to hold any trailing siblings (so
//      the GFM `-`/`*`/`+` marker character carried by `listMarkerState`
//      survives — `$createListNode("bullet")` would default to `-` and
//      silently rewrite `* foo` to `- foo`).
//
//   3. Structurally nested with siblings: can't split at parentList's level
//      (would leave 2-3 sibling ListNodes inside one wrapping LI, breaking
//      @lexical/list's "at most one nested ListNode per LI" invariant and
//      $listExport's nested-recursion guard). Split at the OUTER list's
//      level instead — create new wrapping LIs (copies of the current
//      wrapping LI, preserving LI-level state) to hold the new check list
//      and a trailing bullet list as siblings of the original wrapping LI.
//      The resulting tree shape differs from what the file-import path
//      produces for the same Markdown (import yields two top-level
//      ListNodes), but both shapes serialize identically via `$listExport`
//      and render identically.
const CHECK_LIST_MARKER_REGEX = /^\[([ xX])\] (.*)$/;
const CHECK_LIST_MARKER_LENGTH = 4; // `[ ] ` / `[x] ` / `[X] ` are all 4 chars

export function CheckListShortcutPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ tags, dirtyLeaves, editorState }) => {
      // Skip undo/redo and remote-collab applies — those restore states we
      // already processed (or that we deliberately want to leave alone).
      // Without this guard, Ctrl+Z to a bullet-with-`[ ] ` would re-convert
      // and make undo unreachable.
      if (tags.has(HISTORIC_TAG) || tags.has(COLLABORATION_TAG)) return;
      // Skip our own follow-up update so we don't re-evaluate the same state.
      // (Defensive — the convert removes the bullet item so the shape gate
      // would fail anyway, but this keeps the cycle obvious.)
      if (tags.has(HISTORY_MERGE_TAG)) return;
      // IME compositions land their final character via composition events,
      // not the regular insertion path. Bail until composition ends.
      if (editor.isComposing()) return;

      let target: {
        item: ListItemNode;
        checked: boolean;
        remainingText: string;
        anchorOffsetBeforeMarker: number;
      } | null = null;

      editorState.read(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel) || !sel.isCollapsed()) return;

        const anchorKey = sel.anchor.key;
        if (!dirtyLeaves.has(anchorKey)) return;

        const anchorNode = sel.anchor.getNode();
        if (!$isTextNode(anchorNode)) return;

        const item = anchorNode.getParent();
        if (!$isListItemNode(item)) return;

        const list = item.getParent();
        if (!$isListNode(list) || list.getListType() !== "bullet") return;

        // Exact shape: one TextNode child — anchorNode itself. Anything else
        // (multiple text runs, a LineBreakNode, an inline formatting wrapper)
        // is a structural surprise; bail rather than risk a lossy rewrite.
        // We DON'T gate on format here — the marker text is dropped on
        // convert (the remainder is preserved as the new item's text), so a
        // bold/italic marker still converts cleanly.
        const children = item.getChildren();
        if (children.length !== 1 || children[0] !== anchorNode) return;

        const match = anchorNode.getTextContent().match(CHECK_LIST_MARKER_REGEX);
        if (match === null) return;
        const checked = match[1] === "x" || match[1] === "X";
        const remainingText = match[2];

        // Translate the live caret offset into an offset on the post-convert
        // text. The marker (4 chars) is stripped from the start, so caret
        // offsets within or past the marker collapse to 0; offsets past the
        // marker shift left by 4. For the typing flow (caret right after
        // the marker, offset === 4), this lands at 0 — exactly before the
        // carried-over content. For paste with caret at end (offset
        // === text.length), this lands at end of the carried-over text.
        target = {
          item,
          checked,
          remainingText,
          anchorOffsetBeforeMarker: sel.anchor.offset,
        };
      });

      if (target === null) return;

      const { item, checked, remainingText, anchorOffsetBeforeMarker } = target;
      // Merge with the previous history entry (the typing run that produced
      // the marker text) so the undo-stack target is the state BEFORE the
      // typing started. See the file header for the two pause-related
      // caveats and the safety-under-undo analysis.
      //
      // `discrete: true` runs the convert synchronously (skips the batch
      // queue) so the intermediate `[ ] ...` bullet state never renders to
      // a frame.
      editor.update(
        () => {
          $convertBulletItemToCheck(item, checked, remainingText, anchorOffsetBeforeMarker);
        },
        { tag: HISTORY_MERGE_TAG, discrete: true },
      );
    });
  }, [editor]);

  return null;
}

function $convertBulletItemToCheck(
  bulletItem: ListItemNode,
  checked: boolean,
  remainingText: string,
  anchorOffsetBeforeMarker: number,
): void {
  const parentList = bulletItem.getParent();
  if (!$isListNode(parentList)) return;

  const newCheckItem = $createListItemNode(checked);
  newCheckItem.setIndent(bulletItem.getIndent());
  // Carry over any text that followed the marker (the regex's group-2
  // capture). For typing into an empty item this is "" and the new item
  // stays empty; for typing into existing text (`- |aaa` + `[ ] ` →
  // `[ ] aaa`) this preserves `aaa` on the new check item.
  const carriedTextNode = remainingText.length > 0 ? $createTextNode(remainingText) : null;
  if (carriedTextNode !== null) {
    newCheckItem.append(carriedTextNode);
  }
  // `$copyNode(parentList).setListType("check")` instead of
  // `$createListNode("check")` so the new check list inherits parentList's
  // `listMarkerState`. Otherwise a `* foo` bullet converted via this shortcut
  // would silently rewrite the marker to `-` on save: `$createListNode("check")`
  // gives the new list a default `-` marker, and `$listExport` for check lists
  // writes `${listMarker} [${checked ? "x" : " "}] ...` — i.e. it respects the
  // listNode's `listMarkerState`, NOT a hardcoded `-`. The trailing-bullet
  // path below already uses `$copyNode(parentList)` for the same reason; the
  // check list itself needs the same treatment.
  const newCheckList = $copyNode(parentList);
  newCheckList.setListType("check");
  newCheckList.append(newCheckItem);

  const hasSiblings =
    bulletItem.getPreviousSibling() !== null || bulletItem.getNextSibling() !== null;

  // Only-item path: replace the whole parentList outright. Works for both
  // top-level (root's child swapped bullet → check) and structurally nested
  // (the wrapping LI's sole nested ListNode is swapped bullet → check). The
  // "at most one nested ListNode per LI" invariant is preserved in both
  // shapes because parentList.replace doesn't change how many children the
  // wrapping LI has.
  if (!hasSiblings) {
    parentList.replace(newCheckList);
    $placeCaret(newCheckItem, carriedTextNode, anchorOffsetBeforeMarker);
    return;
  }

  const grandparent = parentList.getParent();
  if ($isListItemNode(grandparent)) {
    // Structurally nested + siblings: can't split at parentList's level —
    // that would leave 2-3 sibling ListNodes inside one wrapping LI,
    // breaking @lexical/list's "at most one nested ListNode per LI"
    // invariant and `$listExport`'s nested-recursion guard
    // (`childrenSize === 1 && $isListNode(firstChild)`). Split at the
    // OUTER list's level instead: create new wrapping LIs (copies of the
    // current wrapping LI, so any LI-level state — `__checked`, `__value` —
    // is preserved) to hold the check list and (optionally) a trailing
    // bullet list as siblings of the original wrapping LI in the outer
    // list. Each wrapper holds exactly one nested ListNode → invariant
    // preserved.
    //
    // The resulting tree differs structurally from what the file import
    // path produces for the same Markdown (`- foo\n    - bar\n    - [ ] `
    // imports as two top-level ListNodes), but both shapes serialize back
    // to the same Markdown via `$listExport` and render identically (the
    // visible indent depth is driven by the nested-ListNode wrapper, not
    // by which level of the tree holds it).
    const wrappingLI = grandparent;
    const newCheckWrappingLI = $copyNode(wrappingLI);
    newCheckWrappingLI.append(newCheckList);
    wrappingLI.insertAfter(newCheckWrappingLI);

    const nextSiblings = bulletItem.getNextSiblings();
    if (nextSiblings.length > 0) {
      const newTrailingWrappingLI = $copyNode(wrappingLI);
      const trailingBulletList = $copyNode(parentList);
      newTrailingWrappingLI.append(trailingBulletList);
      newCheckWrappingLI.insertAfter(newTrailingWrappingLI);
      trailingBulletList.append(...nextSiblings);
    }

    bulletItem.remove();
    if (parentList.isEmpty()) {
      parentList.remove();
      if (wrappingLI.isEmpty()) wrappingLI.remove();
    }
    $placeCaret(newCheckItem, carriedTextNode, anchorOffsetBeforeMarker);
    return;
  }

  // Top-level + siblings: split at parentList's level. Mirrors
  // ListExitPlugin's `$splitListAtListItem` shape. `$copyNode(parentList)`
  // preserves `__listType` / `__start` / `listMarkerState` (the GFM
  // marker char) — `$createListNode("bullet")` would default the marker
  // to `-` and silently rewrite `* foo` to `- foo`.
  parentList.insertAfter(newCheckList);
  const nextSiblings = bulletItem.getNextSiblings();
  if (nextSiblings.length > 0) {
    const trailingList = $copyNode(parentList);
    newCheckList.insertAfter(trailingList);
    trailingList.append(...nextSiblings);
  }
  bulletItem.remove();
  if (parentList.isEmpty()) parentList.remove();

  $placeCaret(newCheckItem, carriedTextNode, anchorOffsetBeforeMarker);
}

// Place the caret on the new check item so the live caret position survives
// the convert verbatim. Translation: marker is exactly 4 chars at the start,
// so the post-convert offset is `oldOffset - 4` clamped to [0, contentLen].
// For the typing flow (caret right after the marker, offset === 4), this
// lands at 0 — exactly before the carried-over content. For paste with
// caret at end (offset === text.length), this lands at end of the
// carried-over text.
function $placeCaret(
  newCheckItem: ListItemNode,
  carriedTextNode: ReturnType<typeof $createTextNode> | null,
  anchorOffsetBeforeMarker: number,
): void {
  if (carriedTextNode === null) {
    newCheckItem.selectStart();
    return;
  }
  const length = carriedTextNode.getTextContentSize();
  const offset = Math.min(length, Math.max(0, anchorOffsetBeforeMarker - CHECK_LIST_MARKER_LENGTH));
  carriedTextNode.select(offset, offset);
}
