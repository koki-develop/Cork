import { $isCodeNode, type CodeNode } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isQuoteNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  type LexicalNode,
  mergeRegister,
} from "lexical";
import { useEffect } from "react";

// Escaping a plain CodeNode is otherwise painful: vanilla Lexical only lets you
// leave by typing two trailing blank lines and pressing Enter a third time, and
// a code block sitting at the very top/bottom of the document has no adjacent
// block to arrow into. This plugin adds three intuitive exits:
//
//   - Shift+Enter (anywhere in the block) inserts a paragraph right after the
//     block and moves there — a one-press escape. Lands as a sibling INSIDE
//     the block's immediate parent (`$escapeAfter`) — for a code block
//     nested in a QuoteNode (see QUOTE_CODE / QuoteCodeShortcutPlugin), that
//     means the new paragraph is still a quoted line. This matches vanilla
//     Lexical's own trailing-Enter exit (`CodeNode.insertNewAfter`, reached
//     by pressing Enter on two already-blank trailing lines), which is the
//     same "stay inside whatever the block was nested in" shape — Shift+Enter
//     is deliberately a faster, one-press version of that SAME exit, not a
//     different one.
//   - ArrowUp on the first line of a block that has no previous sibling
//     inserts an empty paragraph before it and moves up. When the block is
//     ALSO nested inside one or more QuoteNodes with no previous sibling at
//     ANY of those levels either, the check escalates through the OUTERMOST
//     such QuoteNode (`$exitQuotesBefore`) — arrowing up past the very first
//     line of the very first thing in a quote should leave the quote
//     entirely (caret lands unindented), the same way arrowing up out of the
//     quote's own first quoted paragraph already works via QuoteExitPlugin's
//     Backspace-unwrap sibling behavior. A new blank paragraph is only
//     inserted when that OUTERMOST level is ALSO the true edge of the
//     document body — if something already precedes the (possibly-quoted)
//     block there, this plugin steps aside (`return false`, no
//     `preventDefault`) and lets the browser's own native ArrowUp move the
//     caret into that existing content, exactly like the un-nested case
//     already did before quote-nesting existed.
//   - ArrowDown is the mirror image via `$exitQuotesAfter`.
//
// Plain Enter still inserts code lines, and arrow keys still navigate within /
// out of the block normally whenever a neighbouring block already exists —
// including "exists just outside every enclosing quote", not only "exists
// inside the immediate parent".
export function CodeBlockEscapePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand<KeyboardEvent | null>(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event == null || !event.shiftKey) return false;
          const codeNode = $getCodeNodeAtCursor();
          if (codeNode == null) return false;

          event.preventDefault();
          $escapeAfter(codeNode);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_UP_COMMAND,
        (event) => {
          // A plain ArrowUp escapes; Shift/Alt+ArrowUp is selection/word
          // navigation and must be left alone.
          if ($hasNavModifier(event)) return false;
          const codeNode = $getCodeNodeAtCursor();
          // Only escape upward when the block is the first thing at its own
          // level — otherwise the default ArrowUp already reaches the block
          // above.
          if (codeNode == null || codeNode.getPreviousSibling() != null) return false;
          if (!$isOnFirstLineOfCode(codeNode)) return false;
          if (!$exitQuotesBefore(codeNode)) return false;

          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_ARROW_DOWN_COMMAND,
        (event) => {
          if ($hasNavModifier(event)) return false;
          const codeNode = $getCodeNodeAtCursor();
          if (codeNode == null || codeNode.getNextSibling() != null) return false;
          if (!$isOnLastLineOfCode(codeNode)) return false;
          if (!$exitQuotesAfter(codeNode)) return false;

          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  return null;
}

// Shift extends a selection and Alt navigates by word/paragraph — neither
// should be hijacked into escaping the block. (Cmd/Ctrl+Arrow never reaches
// these handlers: it dispatches the move-to-start/end commands instead.)
function $hasNavModifier(event: KeyboardEvent): boolean {
  return event.shiftKey || event.altKey;
}

function $escapeAfter(codeNode: CodeNode): void {
  const paragraph = $createParagraphNode();
  codeNode.insertAfter(paragraph);
  paragraph.select();
}

// Walks upward from `node` through enclosing QuoteNodes, stopping at the
// OUTERMOST ancestor for which `node` (or the QuoteNode standing in for it
// at each successive level) is still at the very edge of its own immediate
// parent per `getEdgeSibling` (`getPreviousSibling` / `getNextSibling`).
// Escaping a code block that sits at the edge of its quote should land the
// caret OUTSIDE the quote entirely (mirroring where the caret visually
// exits, past the closing `>` marker) rather than one level in as another
// quoted paragraph. Stops as soon as either check fails: a same-level
// sibling means there's already somewhere natural to arrow into, and a
// non-QuoteNode parent means we've reached whatever isn't a quote (root, or
// any other container) — for a code block that was never nested in a quote
// at all, this returns `node` unchanged on the very first check, so
// `$exitQuotesBefore` / `$exitQuotesAfter` degrade to plain
// `insertBefore`/`insertAfter` on the CodeNode itself, identical to the
// pre-nesting behavior.
function $outermostQuoteEdge(
  node: LexicalNode,
  getEdgeSibling: (node: LexicalNode) => LexicalNode | null,
): LexicalNode {
  let current = node;
  while (true) {
    const parent = current.getParent();
    if (!$isQuoteNode(parent) || getEdgeSibling(current) != null) {
      return current;
    }
    current = parent;
  }
}

// Returns `false` (and mutates nothing) when the outermost quote-escalated
// edge ALREADY has a previous sibling — i.e. something precedes the
// (possibly-quoted) block at the level where escalation stopped, so there's
// somewhere natural for the browser's own native ArrowUp to land without us
// conjuring a new blank paragraph. Only inserts when `edge` is truly the
// first thing at that level, mirroring the pre-nesting top-level behavior
// ("only escape upward when the block is the first thing in the document").
function $exitQuotesBefore(codeNode: CodeNode): boolean {
  const edge = $outermostQuoteEdge(codeNode, (n) => n.getPreviousSibling());
  if (edge.getPreviousSibling() != null) {
    return false;
  }
  const paragraph = $createParagraphNode();
  edge.insertBefore(paragraph);
  paragraph.select();
  return true;
}

// Mirror of `$exitQuotesBefore` for the downward direction.
function $exitQuotesAfter(codeNode: CodeNode): boolean {
  const edge = $outermostQuoteEdge(codeNode, (n) => n.getNextSibling());
  if (edge.getNextSibling() != null) {
    return false;
  }
  const paragraph = $createParagraphNode();
  edge.insertAfter(paragraph);
  paragraph.select();
  return true;
}

function $getCodeNodeAtCursor(): CodeNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  let node: LexicalNode | null = selection.anchor.getNode();
  while (node != null) {
    if ($isCodeNode(node)) return node;
    node = node.getParent();
  }
  return null;
}

// A "line" is a span between newlines. Those newlines may be stored three ways
// depending on how the block was produced:
//   - As LineBreakNode children (when the user pressed Enter), or
//   - As literal "\n" characters inside a single TextNode (how
//     `$convertFromMarkdownString` initially imports a fenced block before the
//     highlight transforms have run), or
//   - As LineBreakNode children sitting BETWEEN per-token CodeHighlightNode
//     children (after `CodeBlockHighlightPlugin`'s transforms split the block
//     into Prism tokens; CodeHighlightNode is a TextNode subclass).
// `getTextContent()` normalizes all three to "\n", so we resolve the caret's
// absolute character offset within the block's text and check for a newline
// before / after it. The walk from the anchor up to a direct child of
// `codeNode` also terminates correctly for CodeHighlightNode children, since
// they sit directly under the CodeNode. The cursor is on the first line when
// no newline precedes it, and on the last line when none follows it.
function $isOnFirstLineOfCode(codeNode: CodeNode): boolean {
  const offset = $caretOffsetInCode(codeNode);
  if (offset == null) return false;
  return !codeNode.getTextContent().slice(0, offset).includes("\n");
}

function $isOnLastLineOfCode(codeNode: CodeNode): boolean {
  const offset = $caretOffsetInCode(codeNode);
  if (offset == null) return false;
  return !codeNode.getTextContent().slice(offset).includes("\n");
}

/** The caret's character offset within the code block's full text content. */
function $caretOffsetInCode(codeNode: CodeNode): number | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const { anchor } = selection;
  const anchorNode = anchor.getNode();

  // Element-type anchor on the block itself (e.g. an empty block): the offset is
  // a child index — sum the text of the children before it.
  if (anchorNode === codeNode) {
    const children = codeNode.getChildren();
    let chars = 0;
    for (let i = 0; i < anchor.offset && i < children.length; i++) {
      chars += children[i].getTextContent().length;
    }
    return chars;
  }

  // Text-type anchor: sum the text of the preceding direct children of the
  // block, then add the in-node offset.
  let child: LexicalNode | null = anchorNode;
  while (child != null && child.getParent() !== codeNode) {
    child = child.getParent();
  }
  if (child == null) return null;
  let chars = 0;
  for (let sib = child.getPreviousSibling(); sib != null; sib = sib.getPreviousSibling()) {
    chars += sib.getTextContent().length;
  }
  return chars + anchor.offset;
}
