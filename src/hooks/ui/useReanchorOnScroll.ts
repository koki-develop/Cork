import { useEffect } from "react";

/**
 * Re-invokes `onScrollOrResize` on every window scroll (capture phase, so it
 * also catches scrolls inside nested scroll containers, not just the window)
 * or resize while `active` is true. Shared wiring behind any floating panel
 * anchored to a viewport-relative position that must track its target as
 * the page scrolls or the window resizes — pass a stable callback (e.g. one
 * returned by `useEffectEvent`) so this doesn't re-subscribe on every render.
 */
export function useReanchorOnScroll(active: boolean, onScrollOrResize: () => void): void {
  useEffect(() => {
    if (!active) return;
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [active, onScrollOrResize]);
}
