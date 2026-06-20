import { $isLinkNode, $toggleLink } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  type LexicalNode,
  PASTE_COMMAND,
} from "lexical";
import { useEffect } from "react";

import { $getSelectedTextNodes, $isInsideCodeBlock } from "./codeBlock";

// Schemes accepted as a "paste over selection → link" trigger. Matches
// `isBrowserOpenable`'s set, so any link wrapped this way is openable from the
// hover panel. The whole clipboard payload must BE the URL (no internal
// whitespace, no surrounding prose) — pasting an arbitrary line that happens
// to contain a URL falls through to the default paste.
const URL_PATTERN = /^(?:https?|mailto|tel):\S+$/i;

// Selection + pasted URL → wrap the selection as `[text](url)` via
// `$toggleLink`. Registered at `COMMAND_PRIORITY_LOW` so it preempts the
// rich-text plugin's `EDITOR`-priority paste (which would otherwise replace the
// selection with the URL as text).
//
// Creation-only: a selection that already touches any LinkNode (manual or
// autolink) bails, so `FloatingLinkEditorPlugin`'s hover panel remains the
// sole URL edit surface — no silent overwrite when a user pastes onto already-
// linked text. See AGENTS.md → "PasteLinkPlugin" for the full bail rationale
// (block boundaries, soft line breaks, code blocks, link ancestors,
// boundary-trim).
export function PasteLinkPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (!(event instanceof ClipboardEvent)) return false;
        const text = event.clipboardData?.getData("text").trim() ?? "";
        if (!URL_PATTERN.test(text)) return false;

        const selection = $getSelection();
        if (
          !$isRangeSelection(selection) ||
          selection.isCollapsed() ||
          selection.getTextContent().trim() === ""
        ) {
          return false;
        }

        const nodes = selection.getNodes();
        if (nodes.some((n) => $isElementNode(n) || $isLineBreakNode(n))) return false;

        const covered = $getSelectedTextNodes(selection);
        if (covered.some((n) => $isInsideCodeBlock(n) || $hasLinkAncestor(n))) return false;

        $toggleLink(text);
        event.preventDefault();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}

// Any LinkNode ancestor — `$isLinkNode` matches both manual `[text](url)`
// links and `AutoLinkNode`s (which extend `LinkNode`), so this one walk covers
// both bail cases.
function $hasLinkAncestor(node: LexicalNode): boolean {
  for (let n: LexicalNode | null = node; n != null; n = n.getParent()) {
    if ($isLinkNode(n)) return true;
  }
  return false;
}
