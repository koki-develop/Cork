import { $isLinkNode } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isRangeSelection,
  isDOMNode,
  type LexicalNode,
} from "lexical";
import { useEffect } from "react";

export type LinkOpenPluginProps = {
  /** Invoked with the clicked link's URL (wired to the system browser). */
  onOpenLink: (url: string) => void;
};

// Schemes the Tauri opener (`opener:default` capability) can hand to the OS.
const BROWSER_OPENABLE = /^(?:https?|mailto|tel):/i;

// Lexical renders a LinkNode as an `<a>`, but inside a contenteditable a click
// never navigates — and in a Tauri webview we wouldn't want it to anyway. This
// plugin walks from the clicked node up to its LinkNode ancestor and hands the
// URL to `onOpenLink`, so links open in the system browser instead of doing
// nothing. A click that carries a non-collapsed selection is left untouched so
// the user can still select link text.
export function LinkOpenPlugin({ onOpenLink }: LinkOpenPluginProps): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!isDOMNode(target)) return;

      let url: string | null = null;
      let hasTextSelection = false;
      editor.read(() => {
        let node: LexicalNode | null = $getNearestNodeFromDOMNode(target);
        while (node != null) {
          if ($isLinkNode(node)) {
            url = node.getURL();
            break;
          }
          node = node.getParent();
        }
        const selection = $getSelection();
        hasTextSelection = $isRangeSelection(selection) && !selection.isCollapsed();
      });

      // Only follow links the system opener can actually handle. Relative /
      // fragment targets (`./x.md`, `#heading`) and unsupported schemes
      // (`javascript:`, `file:`) are left as no-ops rather than surfacing a
      // "Failed to open link" toast for a click that can't go anywhere useful.
      if (url == null || !BROWSER_OPENABLE.test(url)) return;
      if (hasTextSelection) return;

      event.preventDefault();
      onOpenLink(url);
    };

    return editor.registerRootListener((rootElement) => {
      if (rootElement) {
        rootElement.addEventListener("click", handleClick);
        return () => rootElement.removeEventListener("click", handleClick);
      }
    });
  }, [editor, onOpenLink]);

  return null;
}
