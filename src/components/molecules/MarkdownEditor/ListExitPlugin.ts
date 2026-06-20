import { $isListItemNode, $isListNode, type ListItemNode } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $copyNode,
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  DELETE_LINE_COMMAND,
  DELETE_WORD_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
  type LexicalEditor,
  OUTDENT_CONTENT_COMMAND,
} from "lexical";
import { useEffect } from "react";

// Hooks all three "delete-backward" channels — plain Backspace
// (KEY_BACKSPACE_COMMAND), Cmd+Backspace (DELETE_LINE_COMMAND with
// isBackward=true), and Option+Backspace (DELETE_WORD_COMMAND with
// isBackward=true) — so any backward delete that lands at the START of a
// list item exits the list instead of folding the bullet's content into
// the line above. Default Lexical merges upward, which reads like the
// marker silently glued onto the previous item (e.g. `- aaa\n- |` +
// Cmd+Backspace → `- aaa|`).
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
// Priority LOW: runs ahead of rich-text's EDITOR-priority Backspace /
// DELETE_LINE / DELETE_WORD handlers but loses to TableKeyboard's
// CRITICAL-priority cell handlers (so table-cell delete stays intact).
export function ListExitPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand<KeyboardEvent>(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          if (!$tryExitListAtCaretStart(editor)) return false;
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<boolean>(
        DELETE_LINE_COMMAND,
        (isBackward) => isBackward && $tryExitListAtCaretStart(editor),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<boolean>(
        DELETE_WORD_COMMAND,
        (isBackward) => isBackward && $tryExitListAtCaretStart(editor),
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
