import { $isListItemNode } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  INDENT_CONTENT_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalNode,
  OUTDENT_CONTENT_COMMAND,
} from "lexical";
import { useEffect } from "react";

// Lexical's default Tab handler returns false, so Tab just moves focus out of
// the editor — useless while editing a list. This restores the expected
// behavior, but *only* inside list items: Tab nests (indents) the item,
// Shift+Tab outdents it. Outside a list, Tab is left to its default (focus
// move) so the editor never becomes a keyboard trap. We register at
// COMMAND_PRIORITY_LOW, which runs ahead of rich-text's EDITOR-priority Tab
// handler, and return true only when we actually consume the key.
export function ListTabIndentationPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand<KeyboardEvent>(
      KEY_TAB_COMMAND,
      (event) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        if (!$isInsideListItem(selection.anchor.getNode())) return false;

        event.preventDefault();
        editor.dispatchCommand(
          event.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND,
          undefined,
        );
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}

function $isInsideListItem(node: LexicalNode): boolean {
  let current: LexicalNode | null = node;
  while (current != null) {
    if ($isListItemNode(current)) return true;
    current = current.getParent();
  }
  return false;
}
