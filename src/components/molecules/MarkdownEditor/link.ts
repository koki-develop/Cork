import { $isAutoLinkNode, $isLinkNode, type LinkNode } from "@lexical/link";
import type { LexicalNode } from "lexical";

// Schemes the Tauri opener (`opener:default` capability) can hand to the OS.
// Relative / fragment targets (`./x.md`, `#heading`) and unsupported schemes
// (`javascript:`, `file:`) can't be opened, so callers withhold the open
// affordance for them rather than surfacing a "Failed to open link" toast.
const BROWSER_OPENABLE = /^(?:https?|mailto|tel):/i;

export function isBrowserOpenable(url: string): boolean {
  return BROWSER_OPENABLE.test(url);
}

// The nearest ancestor (or self) that is a manually-authored link — a LinkNode
// that is NOT an AutoLinkNode. Bare-URL AutoLinkNodes are deliberately excluded:
// they're owned by AutoLinkPlugin and round-trip as raw text, so editing their
// URL out-of-band would desync the text from the href and break serialization.
// AutoLinkNode extends LinkNode, so `$isLinkNode` alone would also match it.
export function $closestProseLink(node: LexicalNode): LinkNode | null {
  for (let n: LexicalNode | null = node; n != null; n = n.getParent()) {
    if ($isLinkNode(n) && !$isAutoLinkNode(n)) return n;
  }
  return null;
}
