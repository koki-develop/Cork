import { $isListItemNode, $isListNode, type ListItemNode } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $copyNode,
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  DELETE_LINE_COMMAND,
  DELETE_WORD_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  type LexicalEditor,
  type NodeKey,
  OUTDENT_CONTENT_COMMAND,
  SELECT_ALL_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { useEffect } from "react";

// Two delete-shaped bugs Lexical's defaults produce around lists, both
// handled here so the rewrite plumbing (list split, paragraph carry, item
// classification) lives in one place:
//
// (A) Collapsed-at-start backward delete that folds the bullet's content
//     into the line above — fixed by `$tryExitListAtCaretStart`. Hooked on
//     all three backward-delete channels (Backspace / Cmd+Backspace /
//     Option+Backspace).
//
// (B) Ctrl+A range delete that leaves an empty bullet stub — fixed by
//     the snapshot-based `tryClearRootIfSelectAll`. When the user does
//     Ctrl+A on a doc that starts with a list, default `removeText`
//     preserves the anchor's ListItem and leaves `- ` behind (Ctrl+A +
//     Backspace on `- aaa` or any doc whose first block is a list reduces
//     to `- ` — the bug). Hooked on both directions of every range-delete
//     channel: Backspace / Delete and the line/word variants.
//
// ============ (A) Collapsed-at-start backward delete ============
//
// So any backward delete that lands at the START of a list item exits the
// list instead of folding the bullet's content into the line above
// (default Lexical merges upward, which reads like the marker silently
// glued onto the previous item, e.g. `- aaa\n- |` + Cmd+Backspace →
// `- aaa|`).
//
// Three cases share one entry point:
//
//   1. Empty list item — dispatch INSERT_PARAGRAPH_COMMAND so
//      ListPlugin's own Enter listener runs with whatever options it was
//      configured with (e.g. `shouldPreserveNumbering`). Keeps Enter and
//      every Backspace flavor in lockstep without re-encoding the config.
//
//   2. Non-empty nested item — dispatch OUTDENT_CONTENT_COMMAND so the
//      item moves up one level (content preserved).
//
//   3. Non-empty top-level item — replace the ListItemNode with a
//      ParagraphNode carrying the same inline children, splitting the
//      surrounding list around the cut. Mirrors the structural shape
//      `$handleListInsertParagraph` produces for Enter on an empty item,
//      but keeps the content instead of starting empty.
//
// A list item whose own children contain a nested ListNode is bailed out
// of — the right rewrite is structurally ambiguous and surprising; the
// default delete path is left to handle it.
//
// "Empty" means `getChildrenSize() === 0` (anchor IS the ListItemNode).
// Whitespace-only items (which Lexical's helper considers empty for the
// Enter path) are NOT included — Backspace's contract is per-character
// delete, so a `-   ` item should erode one space at a time, not vanish
// in a single keystroke.
//
// ============ (B) Ctrl+A range delete ============
//
// `removeText` (via `$removeTextFromCaretRange`) keeps the anchor's
// ancestor chain attached: the iteration only flags a node for removal
// once it has seen both its enter and exit carets, and an anchor sitting
// INSIDE a node means the enter caret is never emitted. With anchor at
// offset 0 of the first leaf, the chain Text → ListItem → ListNode all
// dodge removal; the focus's block (also empty after its text slice goes)
// either gets merged into the surviving ListItem or — when focus is in
// the SAME block as anchor (the `- aaa` Ctrl+A case) — no merge happens
// at all. Either way the empty `<li>` survives.
//
// We have to distinguish the Ctrl+A case from a structurally identical
// partial selection: `- |aaa|` (double-click word-select on "aaa") and
// `|- aaa|` (Ctrl+A on `- aaa`) produce the EXACT same RangeSelection
// — anchor=("aaa", 0, text), focus=("aaa", 3, text). The points carry
// no provenance, so the selection alone can't tell us which one
// happened. For the partial case the desired behavior is to leave
// `- ` behind (the cursor stays where it was — same as every other
// rich-text editor); for Ctrl+A the desired behavior is to clear the
// doc to an empty paragraph. Discrimination is provenance-based:
//
//   1. Hook SELECT_ALL_COMMAND at PRIORITY_LOW. The default handler
//      runs after us (at PRIORITY_EDITOR) and mutates the selection
//      via `$selectAll`, so we schedule a microtask to read the
//      resulting selection's points and stash them as a snapshot —
//      reading earlier would capture the pre-$selectAll selection.
//   2. Hook SELECTION_CHANGE_COMMAND at PRIORITY_LOW. Any time the
//      live selection differs from the snapshot, invalidate it. The
//      SELECTION_CHANGE that `$selectAll` itself fires runs BEFORE
//      our microtask sets the snapshot, so it sees a null snapshot
//      and is harmlessly a no-op; every subsequent change (caret
//      move, click, history undo, etc.) flips the snapshot to null.
//   3. In each delete handler, fire the clear-and-paragraph rewrite
//      ONLY when the live selection still equals the snapshot.
//
// The rewrite itself is just `root.clear()` + insert an empty paragraph
// + `selectStart` — no need to thread through `removeText` once the
// outcome is known to be "completely empty doc". Matches what Lexical
// produces by default when a doc whose first block is a paragraph
// gets Ctrl+A'd-and-deleted.
//
// ============ Plumbing ============
//
// Priority LOW: runs ahead of rich-text's EDITOR-priority Backspace /
// Delete / DELETE_LINE / DELETE_WORD handlers but loses to TableKeyboard's
// CRITICAL-priority cell handlers (so table-cell delete stays intact).
type SelectionSnapshot = {
  anchorKey: NodeKey;
  anchorOffset: number;
  anchorType: "text" | "element";
  focusKey: NodeKey;
  focusOffset: number;
  focusType: "text" | "element";
};

export function ListExitPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Provenance for case (B): non-null only when the live selection is
    // verbatim the one $selectAll produced. Cleared by any SELECTION_CHANGE
    // that no longer matches.
    let selectAllSnapshot: SelectionSnapshot | null = null;

    const matchesSnapshot = (): boolean => {
      if (selectAllSnapshot === null) return false;
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return false;
      return (
        sel.anchor.key === selectAllSnapshot.anchorKey &&
        sel.anchor.offset === selectAllSnapshot.anchorOffset &&
        sel.anchor.type === selectAllSnapshot.anchorType &&
        sel.focus.key === selectAllSnapshot.focusKey &&
        sel.focus.offset === selectAllSnapshot.focusOffset &&
        sel.focus.type === selectAllSnapshot.focusType
      );
    };

    const tryClearRootIfSelectAll = (): boolean => {
      if (!matchesSnapshot()) return false;
      const sel = $getSelection();
      if (!$isRangeSelection(sel) || sel.isCollapsed()) return false;
      const root = $getRoot();
      root.clear();
      const paragraph = $createParagraphNode();
      root.append(paragraph);
      paragraph.selectStart();
      selectAllSnapshot = null;
      return true;
    };

    return mergeRegister(
      editor.registerCommand(
        SELECT_ALL_COMMAND,
        () => {
          // Snapshot AFTER the default $selectAll has mutated the selection.
          // Reading synchronously here captures the pre-$selectAll points
          // (we run at PRIORITY_LOW, the default mutator at PRIORITY_EDITOR
          // is dispatched after us); microtask defers past the dispatch.
          queueMicrotask(() => {
            editor.read(() => {
              const sel = $getSelection();
              if (!$isRangeSelection(sel)) return;
              selectAllSnapshot = {
                anchorKey: sel.anchor.key,
                anchorOffset: sel.anchor.offset,
                anchorType: sel.anchor.type,
                focusKey: sel.focus.key,
                focusOffset: sel.focus.offset,
                focusType: sel.focus.type,
              };
            });
          });
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          // Invalidate on any divergence from the snapshot. The
          // SELECTION_CHANGE that $selectAll itself fires runs synchronously
          // BEFORE the microtask above sets the snapshot, so at that point
          // selectAllSnapshot is still null and matchesSnapshot() short-
          // circuits — the null stays null, harmlessly. Every later change
          // (click, arrow keys, history undo, etc.) trips this.
          if (selectAllSnapshot !== null && !matchesSnapshot()) {
            selectAllSnapshot = null;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          if (!$tryExitListAtCaretStart(editor) && !tryClearRootIfSelectAll()) {
            return false;
          }
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_DELETE_COMMAND,
        (event) => {
          if (!tryClearRootIfSelectAll()) return false;
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<boolean>(
        DELETE_LINE_COMMAND,
        (isBackward) =>
          (isBackward && $tryExitListAtCaretStart(editor)) || tryClearRootIfSelectAll(),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<boolean>(
        DELETE_WORD_COMMAND,
        (isBackward) =>
          (isBackward && $tryExitListAtCaretStart(editor)) || tryClearRootIfSelectAll(),
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  return null;
}

function $tryExitListAtCaretStart(editor: LexicalEditor): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  if (selection.anchor.offset !== 0) return false;

  const anchor = selection.anchor.getNode();
  let listItem: ListItemNode | null = null;
  if ($isListItemNode(anchor)) {
    listItem = anchor;
  } else if ($isTextNode(anchor)) {
    const parent = anchor.getParent();
    if ($isListItemNode(parent) && parent.getFirstChild() === anchor) {
      listItem = parent;
    }
  }
  if (listItem === null) return false;

  const parentList = listItem.getParent();
  if (!$isListNode(parentList)) return false;

  if (listItem.getChildrenSize() === 0) {
    return editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
  }

  const grandparent = parentList.getParent();

  if ($isListItemNode(grandparent)) {
    return editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
  }

  if (!$isRootOrShadowRoot(grandparent)) return false;

  if (listItem.getChildren().some($isListNode)) return false;

  $splitListAtListItem(listItem);
  return true;
}

function $splitListAtListItem(listItem: ListItemNode): void {
  const parentList = listItem.getParent();
  if (!$isListNode(parentList)) return;

  const paragraph = $createParagraphNode();
  for (const child of listItem.getChildren()) {
    paragraph.append(child);
  }

  // Mirror $handleListInsertParagraph's split shape: paragraph after the
  // list, trailing siblings moved into a copied list after the paragraph,
  // empty original list cleaned up.
  parentList.insertAfter(paragraph);

  const nextSiblings = listItem.getNextSiblings();
  if (nextSiblings.length > 0) {
    const newList = $copyNode(parentList);
    paragraph.insertAfter(newList);
    newList.append(...nextSiblings);
  }

  listItem.remove();
  if (parentList.isEmpty()) {
    parentList.remove();
  }

  paragraph.selectStart();
}
