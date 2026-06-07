import { type RefObject, useEffect } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Intercept Tab / Shift+Tab so focus stays inside `containerRef` while enabled.
 * Wraps from the last focusable child to the first (and vice versa), and pulls
 * focus back inside if it has somehow drifted out. The caller still owns the
 * initial focus — this hook does not move focus on mount.
 *
 * When the active element is inside a `[data-floating-popup]` portal (e.g. the
 * Select / TagSuggestion dropdowns rendered into `document.body`), the trap
 * defers to that popup's own keydown handler so Tab can dismiss the popup
 * normally instead of being yanked back into the container.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, enabled: boolean) {
  // eslint-disable-next-line react-hooks/exhaustive-deps: containerRef is a stable RefObject whose .current is read at event time
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.defaultPrevented) return;
      const container = containerRef.current;
      if (!container) return;

      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest("[data-floating-popup]")) {
        return;
      }

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null);

      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!(active instanceof Node) || !container.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }

      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [enabled]);
}
