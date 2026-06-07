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

      // `button:not([disabled])` and the other tag-specific selectors don't
      // know about `tabindex="-1"` — e.g. the Modal backdrop is a tabIndex=-1
      // button that still matches `button:not([disabled])`. Filter by the
      // canonical tabIndex property so opted-out elements never enter the
      // cycle (otherwise `focusable[0]` is the backdrop, `active === first`
      // never matches the real first tab stop, and Shift+Tab leaks out).
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null && el.tabIndex >= 0);

      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // Container itself focused (e.g. Modal opens with no [data-autofocus]
      // and falls back to focusing its own tabIndex=-1 wrapper). It's not in
      // the focusable cycle, so without intercepting here the browser default
      // Shift+Tab would escape backward into whatever came before the
      // container in document order. Wrap explicitly in both directions.
      if (active === container) {
        e.preventDefault();
        if (e.shiftKey) {
          last.focus();
        } else {
          first.focus();
        }
        return;
      }

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
