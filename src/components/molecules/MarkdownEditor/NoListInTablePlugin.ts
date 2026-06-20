import { $isListItemNode, $isListNode, ListNode } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isTableCellNode } from "@lexical/table";
import { $findMatchingParent } from "@lexical/utils";
import { $createParagraphNode } from "lexical";
import { useEffect } from "react";

// Safety net for the "no lists in table cells" rule. The primary block
// is in transformers.ts (cell-aware UNORDERED_LIST / ORDERED_LIST /
// CHECK_LIST wrappers), which prevents `- ` / `1. ` / `- [ ] ` typed in
// a cell — and the same shapes on import — from ever becoming a
// ListNode. This plugin catches any ListNode that still ends up inside
// a TableCellNode via a non-transformer path: a raw
// INSERT_UNORDERED_LIST_COMMAND / INSERT_ORDERED_LIST_COMMAND /
// INSERT_CHECK_LIST_COMMAND dispatched while the caret sits in a cell,
// or a paste that drops pre-built Lexical list nodes into a cell.
//
// Cleanup shape: each ListItemNode is replaced by a ParagraphNode
// carrying its inline children, and any nested ListNode is lifted into
// the cell as a sibling so the next transform pass unwraps it too.
// Lexical re-fires the transform on every dirty ListNode until the cell
// contains none, so deeply nested lists flatten safely across passes.
export function NoListInTablePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerNodeTransform(ListNode, (node) => {
      const cell = $findMatchingParent(node, $isTableCellNode);
      if (cell === null) return;

      for (const child of node.getChildren()) {
        if (!$isListItemNode(child)) {
          // Stray non-ListItem children (shouldn't normally exist) — lift
          // them out as siblings of the list so they aren't lost.
          node.insertBefore(child);
          continue;
        }

        const paragraph = $createParagraphNode();
        for (const itemChild of child.getChildren()) {
          if ($isListNode(itemChild)) {
            // Nested list — lift to the cell. The next transform pass
            // will unwrap it the same way.
            node.insertBefore(itemChild);
          } else {
            paragraph.append(itemChild);
          }
        }
        node.insertBefore(paragraph);
      }

      node.remove();
    });
  }, [editor]);

  return null;
}
