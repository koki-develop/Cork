import { $isCodeNode, type CodeNode } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
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
//     block and moves there — a one-press escape.
//   - ArrowUp on the first line of a block that is the document's first block
//     inserts an empty paragraph before it and moves up.
//   - ArrowDown on the last line of a block that is the document's last block
//     inserts an empty paragraph after it and moves down.
//
// Plain Enter still inserts code lines, and arrow keys still navigate within /
// out of the block normally whenever a neighbouring block already exists.
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
          // Only escape upward when the block is the first thing in the
          // document — otherwise the default ArrowUp already reaches the block
          // above.
          if (codeNode == null || codeNode.getPreviousSibling() != null) return false;
          if (!$isOnFirstLineOfCode(codeNode)) return false;

          event.preventDefault();
          const paragraph = $createParagraphNode();
          codeNode.insertBefore(paragraph);
          paragraph.select();
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

          event.preventDefault();
          $escapeAfter(codeNode);
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
