import { $createListItemNode, $isListItemNode, $isListNode, ListItemNode } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent } from "@lexical/utils";
import {
  $copyNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  type ElementNode,
  INDENT_CONTENT_COMMAND,
  type RangeSelection,
} from "lexical";
import { useEffect } from "react";

// Custom indent for list items that fully owns the INDENT_CONTENT_COMMAND
// (not just intercepts the type-mismatch single-item case). Required because
// upstream `$handleIndent` (`@lexical/list/formatList.ts`) unconditionally
// appends the indented item into `prevSibling.getFirstChild()` (the nested
// ListNode) when the prev sibling is a wrapping LI — without checking the
// nested list's type. So a bullet item Tab'd next to a check-containing
// wrapper silently becomes a check item (the nested check ListNode adopts
// it; `ListItemNode.__checked` defaults to undefined which renders as
// unchecked under a check parent). Multi-item Tab makes the bug worse — a
// selection across several bullet items next to a check wrapper turns ALL
// of them into check items.
//
// User-visible bug: `- aaa\n  - [ ] bbb\n- ccc` + Tab on `ccc` produces
// `- aaa\n  - [ ] bbb\n  - [ ] ccc` (ccc became a check item) instead of
// `- aaa\n  - [ ] bbb\n  - ccc` (ccc stays a bullet in a NEW nested bullet
// ListNode next to the check one). Multi-item: selecting `ccc` AND a `ddd`
// below and pressing Tab made both check items under upstream.
//
// Fix: intercept `INDENT_CONTENT_COMMAND` at `COMMAND_PRIORITY_LOW` (ahead
// of rich-text's EDITOR-priority `$handleIndentAndOutdent` which routes to
// upstream's `$handleIndent`). For each LI in the selection (document
// order, deduplicated), apply our type-aware indent: prefer appending to a
// SAME-TYPE adjacent nested list, else create a fresh wrapping LI with a
// `$copyNode(parentList)` nested list (preserving `__listType`, `__start`,
// `listMarkerState`). This matches upstream's structural shape for the
// same-type cases AND solves the type-mismatch cases in one unified path —
// each item ends up at depth+1 inside a nested ListNode of its OWN type.
//
// Multi-item ordering: items processed in document order. When the FIRST
// item creates a new nested wrapping LI, the SECOND item (still in the
// outer ListNode) sees that wrapping LI as its new prev sibling. Its
// type-aware indent then appends it to that same nested list (same type
// match), giving the natural "indent chain" — consecutive selected items
// merge into the same nested list, matching upstream's multi-item shape.
export function CheckListIndentPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      INDENT_CONTENT_COMMAND,
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        const items = $getSelectedListItems(selection);
        if (items.length === 0) return false;

        for (const item of items) {
          $handleItemIndent(item);
        }

        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}

// Collect ListItemNode blocks in the selection in document order,
// deduplicated. Mirrors `$handleIndentAndOutdent`'s block discovery from
// `@lexical/utils` so multi-item behavior matches.
function $getSelectedListItems(selection: RangeSelection): ListItemNode[] {
  const items: ListItemNode[] = [];
  const seen = new Set<string>();
  for (const node of selection.getNodes()) {
    const block = $findMatchingParent(
      node,
      (n): n is ElementNode => $isElementNode(n) && !n.isInline(),
    );
    if (!$isListItemNode(block)) continue;
    if (!block.canIndent()) continue;
    if (seen.has(block.getKey())) continue;
    seen.add(block.getKey());
    items.push(block);
  }
  return items;
}

function $handleItemIndent(item: ListItemNode): void {
  // Skip wrapping LIs (their first child is a nested ListNode).
  if ($isListNode(item.getFirstChild())) return;

  const parent = item.getParent();
  if (!$isListNode(parent)) return;
  const parentType = parent.getListType();

  const prevSibling = item.getPreviousSibling();
  const nextSibling = item.getNextSibling();

  const prevInner = $isListItemNode(prevSibling) ? prevSibling.getFirstChild() : null;
  const nextInner = $isListItemNode(nextSibling) ? nextSibling.getFirstChild() : null;
  const prevInnerMatches = $isListNode(prevInner) && prevInner.getListType() === parentType;
  const nextInnerMatches = $isListNode(nextInner) && nextInner.getListType() === parentType;

  // Same-type prev wrapper: append to its nested list. If next is ALSO a
  // same-type wrapper, merge its children into prev's nested list and
  // remove next (matches upstream's bridge-merge for adjacent same-type
  // wrappers).
  if (prevInnerMatches && $isListNode(prevInner)) {
    prevInner.append(item);
    if (nextInnerMatches && $isListNode(nextInner) && $isListItemNode(nextSibling)) {
      prevInner.append(...nextInner.getChildren());
      nextSibling.remove();
    }
    return;
  }

  // Only next is same-type wrapper: insert at the start of its nested list
  // so the indented item stays in document order relative to next's existing
  // children.
  if (nextInnerMatches && $isListNode(nextInner)) {
    const firstChild = nextInner.getFirstChild();
    if (firstChild !== null) firstChild.insertBefore(item);
    else nextInner.append(item);
    return;
  }

  // No same-type adjacent wrapper. Create a fresh wrapping LI containing a
  // `$copyNode(parent)` nested list (preserves __listType / __start /
  // listMarkerState). Placement: after prev if any, else before next, else
  // append to parent. Matches upstream's else-branch placement so single-
  // item indent shape is preserved.
  const newWrappingLI = $createListItemNode();
  const newNestedList = $copyNode(parent);
  newWrappingLI.append(newNestedList);

  if (prevSibling !== null) {
    prevSibling.insertAfter(newWrappingLI);
  } else if (nextSibling !== null) {
    nextSibling.insertBefore(newWrappingLI);
  } else {
    parent.append(newWrappingLI);
  }

  newNestedList.append(item);
}
