// Shared viewport-space placement helpers for the editor's floating panels (the
// selection format toolbar and the link editor). All coordinates are
// viewport-relative — both panels are `position: fixed`.

// Gap between the anchor and the panel, and the minimum padding a panel keeps
// from the viewport edges.
export const GAP = 8;
export const EDGE_PADDING = 8;

// Viewport-space geometry a floating panel anchors to: a horizontal span
// (`left`..`left + width`) at vertical `top`, with `bottom` marking the lowest
// edge of the whole anchor so a flip clears all of it.
export type Anchor = { left: number; top: number; bottom: number; width: number };

// The first non-empty line box of a set of client rects, falling back to the
// bounding box. A multi-line anchor (a wrapped selection, or a link that wraps)
// reports one rect per line: the FIRST line tracks the real start of the content
// and stays put as more lines join, whereas the bounding box is inflated by the
// full-width line-fill rects and would drag the anchor toward the center. `top`
// and `width` come from that first line; `bottom` always comes from the bounding
// box so a flip-below clears every line.
export function firstLineAnchor(clientRects: DOMRectList, bounding: DOMRect): Anchor | null {
  for (let i = 0; i < clientRects.length; i++) {
    const rect = clientRects[i];
    if (rect.width > 0 || rect.height > 0) {
      return { left: rect.left, top: rect.top, bottom: bounding.bottom, width: rect.width };
    }
  }
  // No usable line rects (e.g. an anchor over non-text content): fall back to
  // the bounding box if it has any extent.
  if (bounding.width === 0 && bounding.height === 0) return null;
  return { left: bounding.left, top: bounding.top, bottom: bounding.bottom, width: bounding.width };
}

function clampX(x: number, width: number): number {
  return Math.min(Math.max(x, EDGE_PADDING), window.innerWidth - width - EDGE_PADDING);
}

// Top-left viewport coordinate for a panel centered over the anchor and placed
// above it, flipping below when there's no room and clamping to the viewport
// edges. Used by the selection format toolbar, which mirrors the selection.
export function placeCenteredAbove(
  anchor: Anchor,
  size: { width: number; height: number },
): { x: number; y: number } {
  const x = clampX(anchor.left + anchor.width / 2 - size.width / 2, size.width);
  const above = anchor.top - size.height - GAP;
  const y = above < EDGE_PADDING ? anchor.bottom + GAP : above;
  return { x, y };
}

// Top-left viewport coordinate for a panel left-aligned to the anchor's start
// and placed below it, flipping above when there's no room and clamping to the
// viewport edges. Used by the link editor: left-aligned (not centered) so a long
// URL panel grows rightward from the link's start instead of drifting
// off-center as its width changes between view and edit modes.
export function placeBelowStart(
  anchor: Anchor,
  size: { width: number; height: number },
): { x: number; y: number } {
  const x = clampX(anchor.left, size.width);
  const below = anchor.bottom + GAP;
  // Flip above when there's no room below, clamping to EDGE_PADDING so a panel
  // that fits neither way (tiny / zoomed viewport, tall edit-mode panel) lands
  // at the top edge rather than off-screen above it.
  const y =
    below + size.height + EDGE_PADDING > window.innerHeight
      ? Math.max(anchor.top - size.height - GAP, EDGE_PADDING)
      : below;
  return { x, y };
}

// Whether two anchors describe the same viewport box. Lets a re-anchor on
// scroll/resize skip the state update (and re-render) when nothing moved.
export function anchorsEqual(a: Anchor, b: Anchor): boolean {
  return a.left === b.left && a.top === b.top && a.bottom === b.bottom && a.width === b.width;
}
