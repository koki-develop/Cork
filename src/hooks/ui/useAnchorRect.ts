import { type RefObject, useLayoutEffect, useState } from "react";

/**
 * Returns the anchor element's `DOMRect` while `open` is true, recomputed
 * whenever any value in `extraDeps` changes. Callers convert the rect into
 * whatever shape their popover needs (left/right/center/etc) so this hook
 * stays positioning-agnostic.
 */
export function useAnchorRect(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  extraDeps: unknown[] = [],
): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps: extraDeps is spread to let callers trigger recomputation on layout-affecting state changes
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const el = anchorRef.current;
    if (!el) return;
    setRect(el.getBoundingClientRect());
  }, [open, anchorRef, ...extraDeps]);

  return rect;
}
