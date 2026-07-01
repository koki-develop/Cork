import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isHorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import {
  $createNodeSelection,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
} from "lexical";
import { useEffect } from "react";

// Left/right arrows step onto a horizontal rule as a node selection (Lexical's
// `$shouldOverrideDefaultCharacterSelection` treats an adjacent decorator as a
// stop), but up/down don't: rich-text's vertical handlers deliberately *skip
// over* a block decorator, so the caret leaps across a rule without landing on
// it. This plugin restores the symmetry — when the collapsed caret sits on the
// block's edge visual line facing a rule (its last line for ArrowDown, its first
// for ArrowUp), the arrow selects the rule (so it can be seen and deleted)
// instead of jumping past. It runs at COMMAND_PRIORITY_LOW, ahead of the
// rich-text handler (COMMAND_PRIORITY_EDITOR), and bails the instant the
// neighbour isn't a rule or the caret is mid-block, leaving every other vertical
// move to the defaults.
//
// Edge detection is geometric (caret rect vs. block rect) rather than the
// text-offset boundary check the defaults use, so a rule is reachable from *any*
// column of the adjacent line — not only from the block's very start / end —
// while a wrapped paragraph still navigates line-by-line internally.
export function HorizontalRuleKeyboardPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_UP_COMMAND,
        (event) => $handleArrow(editor, event, true),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_DOWN_COMMAND,
        (event) => $handleArrow(editor, event, false),
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  return null;
}

function $handleArrow(editor: LexicalEditor, event: KeyboardEvent, isBackward: boolean): boolean {
  // Shift extends a selection and Alt navigates by word — neither should be
  // hijacked into selecting the rule.
  if (event.shiftKey || event.altKey) {
    return false;
  }
  if (!$selectAdjacentHorizontalRule(editor, isBackward)) {
    return false;
  }
  event.preventDefault();
  return true;
}

function $selectAdjacentHorizontalRule(editor: LexicalEditor, isBackward: boolean): boolean {
  const selection = $getSelection();
  // Only a collapsed range caret moves onto the rule; an existing node selection
  // is left to the rich-text handler so a second press steps off the rule.
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const block = selection.anchor.getNode().getTopLevelElement();
  if (block == null) {
    return false;
  }

  // Scoped to horizontal rules — the only block decorator this editor has (tables
  // are ElementNodes). The underlying problem is generic to block decorators, so
  // if another is ever added, widen this to `$isDecoratorNode(rule) && !rule.isInline()`.
  const rule = isBackward ? block.getPreviousSibling() : block.getNextSibling();
  if (!$isHorizontalRuleNode(rule)) {
    return false;
  }

  // Only fire from the visual line touching the rule, so a mid-paragraph move
  // still travels line-by-line within the block before reaching it.
  if (!isCaretOnEdgeLine(editor, block, isBackward)) {
    return false;
  }

  const nodeSelection = $createNodeSelection();
  nodeSelection.add(rule.getKey());
  $setSelection(nodeSelection);
  return true;
}

// True when the collapsed caret is on `block`'s first (ArrowUp) / last (ArrowDown)
// visual line, by comparing the caret's client rect to the block element's.
function isCaretOnEdgeLine(editor: LexicalEditor, block: LexicalNode, isUp: boolean): boolean {
  const blockElem = editor.getElementByKey(block.getKey());
  if (blockElem == null) {
    return false;
  }
  // `block.getDOMSlot(blockElem).element` resolves the children-host element
  // — for most blocks that's the same `blockElem`, but a wrapper block like
  // `CorkCodeNode` puts a non-content sibling (the language chip) inside the
  // outer `<div>` and routes children into a nested `<code>`. Using the
  // children-host element keeps the geometric edge comparison aligned with the
  // caret's actual line (the chip's height isn't counted as part of the
  // content area). Non-ElementNode blocks fall through to the outer element.
  const contentElem = $isElementNode(block) ? block.getDOMSlot(blockElem).element : blockElem;

  const domSelection = contentElem.ownerDocument.defaultView?.getSelection();
  if (domSelection == null || domSelection.rangeCount === 0) {
    // No measurable caret (e.g. an empty block) — it's a single line, so either
    // direction is an edge.
    return true;
  }

  const caretRect = getCaretRect(domSelection.getRangeAt(0));
  if (caretRect == null) {
    return true;
  }

  const blockRect = contentElem.getBoundingClientRect();
  // Half a line of slack: the caret's height ≈ one line, so a caret within half
  // of that from the block's edge is on the first / last visual line, while one
  // a full line in is excluded so wrapped paragraphs navigate line-by-line.
  // (getCaretRect only ever returns a positive-height rect — null short-circuits
  // to true above — so `caretRect.height` is always > 0 here.)
  const tolerance = caretRect.height / 2;
  return isUp
    ? caretRect.top - blockRect.top <= tolerance
    : blockRect.bottom - caretRect.bottom <= tolerance;
}

// A collapsed range can yield an empty rect in WebKit; fall back to measuring a
// cloned range spanning one adjacent character (no mutation of the live
// selection), which still reports the caret's line position.
function getCaretRect(range: Range): DOMRect | null {
  const rect = range.getBoundingClientRect();
  if (rect.height > 0) {
    return rect;
  }

  const node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) {
    const length = node.textContent?.length ?? 0;
    const clone = range.cloneRange();
    if (range.startOffset < length) {
      clone.setEnd(node, range.startOffset + 1);
    } else if (range.startOffset > 0) {
      clone.setStart(node, range.startOffset - 1);
    }
    const cloneRect = clone.getBoundingClientRect();
    if (cloneRect.height > 0) {
      return cloneRect;
    }
  }

  return null;
}
