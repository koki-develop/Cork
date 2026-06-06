import { type RefObject, useEffect, useEffectEvent } from "react";

type Options = {
  /**
   * Treat elements with `[data-floating-popup]` ancestry as "inside" for
   * outside-click purposes. Use this when a host popover contains nested
   * portaled UI (Select dropdowns, autocomplete suggestions) that render
   * outside the host's DOM tree but should not dismiss it.
   */
  ignorePortalPopups?: boolean;
  /**
   * Only react to the primary (left) mouse button. Use for context menus,
   * where a right-click on a sibling element is meant to open a new menu,
   * not close-then-reopen the current one (which causes a visible flicker
   * through the exit/enter animation).
   */
  primaryButtonOnly?: boolean;
};

export function useClickOutside(
  refs: RefObject<HTMLElement | null>[],
  callback: () => void,
  enabled: boolean,
  options: Options = {},
) {
  const callbackEvent = useEffectEvent(callback);
  const { ignorePortalPopups = false, primaryButtonOnly = false } = options;

  // eslint-disable-next-line react-hooks/exhaustive-deps: `refs` is a stable array of RefObjects whose .current is read at event time
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MouseEvent) => {
      if (primaryButtonOnly && e.button !== 0) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      for (const ref of refs) {
        if (ref.current?.contains(target)) return;
      }
      if (
        ignorePortalPopups &&
        target instanceof Element &&
        target.closest("[data-floating-popup]")
      ) {
        return;
      }
      callbackEvent();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [enabled, ignorePortalPopups, primaryButtonOnly]);
}
