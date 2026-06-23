import { $isListItemNode, $isListNode, ListItemNode, type ListNode } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent } from "@lexical/utils";
import {
  $copyNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  type ElementNode,
  type NodeKey,
  OUTDENT_CONTENT_COMMAND,
  type RangeSelection,
} from "lexical";
import { useEffect } from "react";

// Custom outdent for list items that fully owns the OUTDENT_CONTENT_COMMAND.
// Required because upstream `$handleOutdent` (`@lexical/list/formatList.ts`)
// moves an outdented item into its `greatGrandparentList` without adjusting
// `__listType`, so a check item Shift+Tab'd through a bullet wrapper ends up
// as a child of the outer BULLET ListNode, and `ListItemNode.$transform`
// then clears `__checked` (parent isn't a check list). The user observes
// their check item silently turning into a bullet on Shift+Tab. Multi-item
// Shift+Tab compounded the bug — every check item in the selection became
// a bullet.
//
// User-visible bug: `- foo\n  - [ ] bar` + Shift+Tab on `bar` produced
// `- foo\n- bar` (bar silently became a bullet) instead of
// `- foo\n- [ ] bar`. Multi-item: selecting several check items inside a
// bullet wrapper and pressing Shift+Tab turned all of them into bullets.
//
// Fix: intercept `OUTDENT_CONTENT_COMMAND` at `COMMAND_PRIORITY_LOW` (ahead
// of rich-text's EDITOR-priority `$handleIndentAndOutdent` which routes to
// upstream's `$handleOutdent`). For each LI in the selection (document
// order, deduplicated), apply our type-aware outdent. Two branches per item:
//
//   1. Same type (parentList type === outerList type): mirror upstream's
//      `$handleOutdent` verbatim — first/last simple insertBefore /
//      insertAfter, middle splits into two new wrapping LIs around the
//      outdented item.
//
//   2. Type mismatch: lift the item OUT of the outer list entirely, into a
//      same-type ListNode at outerList's parent level. Sub-cases by where
//      outerList lives:
//        - Root case (outerList.parent is root): place a `$copyNode(parentList)`
//          (= the liftedList) as outerList's sibling. Trailing siblings of
//          `item` in parentList AND of wrappingLI in outerList move into a
//          `$copyNode(outerList)` after the liftedList — items at the cut
//          point keep their original depth visually.
//        - Nested case (outerList.parent is a wrappingLI, i.e. doubly or
//          deeper nested): wrap liftedList in a new LI alongside grandWrappingLI
//          in grandOuter. Trailing siblings stay in their original positions.
//
// Multi-item consolidation: items processed in document order, with per-
// outerList cursors tracking the most-recently-created liftedList (root case)
// or wrapping LI (nested case) so subsequent items from the SAME source
// outerList get appended to it instead of starting a new list. This collapses
// what would otherwise be N separate liftedLists into ONE consolidated list —
// matching the natural shape a user expects:
// `- foo\n- [ ] a\n- [ ] b\n- [ ] c` (single check ListNode) instead of
// three margin-separated check ListNodes.
//
// Both cursors are `Map<NodeKey, ...>` keyed by the source outerList /
// grandWrappingLI so items lifted out of DIFFERENT source lists don't cross-
// pollinate. Critical for the root case: when the FIRST item splits its
// outerList into outerList + rightSideOuter, the SECOND item from the same
// source is now structurally inside rightSideOuter (a different node, with a
// different key); we register rightSideOuter under the same liftedList so the
// reuse lookup still hits. Without this continuation, the second item would
// land in its own liftedList — a margin gap appears between `a` and `b` in the
// `- foo\n  - [ ] a\n  - [ ] b\n  - [ ] c` → outdent {a,b} example.
// Conversely, a global cursor (single liftedList across all items) would
// incorrectly merge items lifted out of DIFFERENT root-level outerLists:
// `- foo\n  - [ ] a\n- bar\n  - [ ] b` + outdent {a,b} would land a AND b in
// outer1's neighbouring liftedList — `- foo\n- [ ] a\n- [ ] b\n- bar` instead
// of `- foo\n- [ ] a\n- bar\n- [ ] b`.
export function CheckListOutdentPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      OUTDENT_CONTENT_COMMAND,
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        const items = $getSelectedListItems(selection);
        if (items.length === 0) return false;

        // Cursors keyed by source outerList / grandWrappingLI. Each entry
        // holds the most-recent ListNode (root case) / wrapping LI (nested
        // case) that a same-type subsequent item lifted out of the same source
        // can append to / chain after. The root case ALSO registers the
        // right-side split (`rightSideOuter`) under the same liftedList so
        // items from the post-split tree keep consolidating with their pre-
        // split siblings.
        const rootCursors = new Map<NodeKey, ListNode>();
        const nestedCursors = new Map<NodeKey, ListItemNode>();

        for (const item of items) {
          $handleItemOutdent(item, rootCursors, nestedCursors);
        }

        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}

// Mirrors `$handleIndentAndOutdent`'s block discovery from `@lexical/utils`
// so multi-item behavior matches.
function $getSelectedListItems(selection: RangeSelection): ListItemNode[] {
  const items: ListItemNode[] = [];
  const seen = new Set<NodeKey>();
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

function $handleItemOutdent(
  item: ListItemNode,
  rootCursors: Map<NodeKey, ListNode>,
  nestedCursors: Map<NodeKey, ListItemNode>,
): void {
  // Skip wrapping LIs (their first child is a nested ListNode).
  if ($isListNode(item.getFirstChild())) return;

  const parentList = item.getParent();
  if (!$isListNode(parentList)) return;

  const wrappingLI = parentList.getParent();
  if (!$isListItemNode(wrappingLI)) return; // not nested, can't outdent

  const outerList = wrappingLI.getParent();
  if (!$isListNode(outerList)) return;

  // Canonical wrap only (wrappingLI's sole child is parentList). Non-canonical
  // wrappers (mixed text + nested list) are rare via the indent path and
  // would need a different rewrite. Skip silently.
  if (wrappingLI.getChildrenSize() !== 1 || wrappingLI.getFirstChild() !== parentList) {
    return;
  }

  if (parentList.getListType() === outerList.getListType()) {
    $handleSameTypeOutdent(item, parentList, wrappingLI);
  } else {
    $handleTypeMismatchOutdent(item, parentList, wrappingLI, outerList, rootCursors, nestedCursors);
  }
}

// Same-type outdent: mirrors upstream's `$handleOutdent` in
// `@lexical/list/formatList.ts`. First / last simple move; middle splits into
// prev / next wrapping LIs around the outdented item.
function $handleSameTypeOutdent(
  item: ListItemNode,
  parentList: ListNode,
  wrappingLI: ListItemNode,
): void {
  const firstChild = parentList.getFirstChild();
  const lastChild = parentList.getLastChild();

  if (item.is(firstChild)) {
    wrappingLI.insertBefore(item);
    if (parentList.isEmpty()) wrappingLI.remove();
    return;
  }

  if (item.is(lastChild)) {
    wrappingLI.insertAfter(item);
    if (parentList.isEmpty()) wrappingLI.remove();
    return;
  }

  // Middle item: split surrounding siblings into two new wrapping LIs around
  // the outdented item. Snapshot sibling arrays BEFORE the moves so iteration
  // doesn't drift.
  const prevSiblings = item.getPreviousSiblings();
  const nextSiblings = item.getNextSiblings();

  const prevSiblingsListItem = $copyNode(item);
  const prevSiblingsList = $copyNode(parentList);
  prevSiblingsListItem.append(prevSiblingsList);

  const nextSiblingsListItem = $copyNode(item);
  const nextSiblingsList = $copyNode(parentList);
  nextSiblingsListItem.append(nextSiblingsList);

  wrappingLI.insertBefore(prevSiblingsListItem);
  wrappingLI.insertAfter(nextSiblingsListItem);
  wrappingLI.replace(item);

  prevSiblingsList.append(...prevSiblings);
  nextSiblingsList.append(...nextSiblings);
}

// Type-mismatch outdent: lift item into a same-type ListNode at outerList's
// parent level. Uses cursors to consolidate consecutive items targeting the
// same destination into ONE list.
function $handleTypeMismatchOutdent(
  item: ListItemNode,
  parentList: ListNode,
  wrappingLI: ListItemNode,
  outerList: ListNode,
  rootCursors: Map<NodeKey, ListNode>,
  nestedCursors: Map<NodeKey, ListItemNode>,
): void {
  // Snapshot mutation targets BEFORE any moves.
  const nextSiblingsInParent = item.getNextSiblings();
  const trailingSiblingsInOuter = wrappingLI.getNextSiblings();

  const grandWrappingLI = outerList.getParent();
  const targetType = parentList.getListType();

  if ($isListItemNode(grandWrappingLI)) {
    // Nested case: check cursor for grandWrappingLI to reuse a previously-
    // inserted wrapping LI whose nested list is the same type.
    const grandKey = grandWrappingLI.getKey();
    const lastNewLI = nestedCursors.get(grandKey);
    const lastInner = lastNewLI !== undefined ? lastNewLI.getFirstChild() : null;
    const canReuseLastNewLI = $isListNode(lastInner) && lastInner.getListType() === targetType;

    if (canReuseLastNewLI && $isListNode(lastInner)) {
      lastInner.append(item);
    } else {
      const newLI = $copyNode(grandWrappingLI);
      const liftedList = $copyNode(parentList);
      newLI.append(liftedList);
      const insertAnchor = lastNewLI ?? grandWrappingLI;
      insertAnchor.insertAfter(newLI);
      liftedList.append(item);
      nestedCursors.set(grandKey, newLI);
    }
  } else {
    // Root case: look up rootCursors by the SOURCE outerList's key (and by the
    // rightSideOuter's key registered after a previous split — see below). If
    // a same-type liftedList is registered for this outerList, append directly;
    // nextSiblingsInParent and trailingSiblingsInOuter stay in place — they'll
    // be picked up on their own iteration (if selected) or remain at original
    // depth (if not).
    const outerKey = outerList.getKey();
    const reusableLifted = rootCursors.get(outerKey);
    const canReuseRoot =
      reusableLifted !== undefined && reusableLifted.getListType() === targetType;

    if (canReuseRoot && reusableLifted !== undefined) {
      reusableLifted.append(item);
    } else {
      const liftedList = $copyNode(parentList);
      liftedList.append(item);
      outerList.insertAfter(liftedList);
      rootCursors.set(outerKey, liftedList);

      // Only the FIRST item in a chain needs to handle trailing siblings —
      // subsequent same-destination items would have empty trailing
      // siblings (their parentList only ever held them after the first
      // item's split). For the first item, split outerList around
      // wrappingLI into a rightSideOuter after liftedList.
      if (nextSiblingsInParent.length > 0 || trailingSiblingsInOuter.length > 0) {
        const rightSideOuter = $copyNode(outerList);

        if (nextSiblingsInParent.length > 0) {
          const newWrappingLI = $copyNode(wrappingLI);
          const newNestedList = $copyNode(parentList);
          newWrappingLI.append(newNestedList);
          rightSideOuter.append(newWrappingLI);
          newNestedList.append(...nextSiblingsInParent);
        }

        if (trailingSiblingsInOuter.length > 0) {
          rightSideOuter.append(...trailingSiblingsInOuter);
        }

        liftedList.insertAfter(rightSideOuter);
        // Register the rightSideOuter under the SAME liftedList so subsequent
        // items from the same source — now structurally inside rightSideOuter
        // after this split — keep consolidating instead of starting a new
        // liftedList. Without this, the chain breaks at every split, yielding
        // margin-separated lists where the user expects one continuous list.
        rootCursors.set(rightSideOuter.getKey(), liftedList);
      }
    }
  }

  // Cascade cleanup of newly-empty ancestors.
  if (parentList.isEmpty()) {
    parentList.remove();
    if (wrappingLI.isEmpty()) {
      wrappingLI.remove();
      if (outerList.isEmpty()) {
        outerList.remove();
        if ($isListItemNode(grandWrappingLI) && grandWrappingLI.isEmpty()) {
          grandWrappingLI.remove();
        }
      }
    }
  }
}
