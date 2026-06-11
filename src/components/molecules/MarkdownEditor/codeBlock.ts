import { $isCodeNode } from "@lexical/code";
import { $isTextNode, type LexicalNode, type RangeSelection, type TextNode } from "lexical";

// Whether `node` sits within a fenced code block. The block's text is a plain
// `TextNode` (this editor doesn't register syntax highlighting, so it never
// becomes a `CodeHighlightNode`), so `canHaveFormat()` reports `true` for it and
// can't be used to tell code from prose — the only reliable signal is the
// structural one: an ancestor `CodeNode`.
export function $isInsideCodeBlock(node: LexicalNode): boolean {
  for (let n: LexicalNode | null = node; n != null; n = n.getParent()) {
    if ($isCodeNode(n)) return true;
  }
  return false;
}

// A text node that inline formats can actually act on: any TextNode NOT inside a
// fenced code block. (Inline-code text carries a `code` format flag but is a
// plain TextNode outside any CodeNode, so it still counts as formattable.) This
// is the single discriminator both the floating toolbar (which formats are
// applied / shown active) and the format command (which nodes get toggled) hang
// off, so code-block text is treated identically everywhere.
export function $isFormattableTextNode(node: LexicalNode): node is TextNode {
  return $isTextNode(node) && !$isInsideCodeBlock(node);
}

// The formattable text nodes the selection actually covers — prose only (code
// excluded), and with zero-width boundary nodes dropped: a node the selection
// merely touches at its very start (anchor at end-of-node) or very end (focus at
// offset 0) carries none of the selected characters. This mirrors how
// `RangeSelection.extract()` trims (shift/pop) those boundary nodes, so this
// read-only set is identical to the one the format command toggles after
// `extract()` splits the boundaries. Both the toolbar's active state and the
// command's toggle direction read from here, so a dimmed button always enables
// and a lit one always clears — they can never disagree about what is selected.
export function $getSelectedFormattableTextNodes(selection: RangeSelection): TextNode[] {
  const isBackward = selection.isBackward();
  const startPoint = isBackward ? selection.focus : selection.anchor;
  const endPoint = isBackward ? selection.anchor : selection.focus;

  return selection
    .getNodes()
    .filter($isFormattableTextNode)
    .filter((node) => {
      const key = node.getKey();
      if (
        startPoint.type === "text" &&
        startPoint.key === key &&
        startPoint.offset === node.getTextContentSize()
      ) {
        return false;
      }
      if (endPoint.type === "text" && endPoint.key === key && endPoint.offset === 0) {
        return false;
      }
      return true;
    });
}
