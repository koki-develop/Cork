import { useEffect, useEffectEvent } from "react";

type Options = {
  /**
   * Skip the callback if `e.defaultPrevented` is true. Used by Modal so that
   * nested popovers (e.g. a Select dropdown inside a dialog) can intercept
   * Escape via `e.preventDefault()` without dismissing the modal too.
   */
  respectDefaultPrevented?: boolean;
};

export function useEscapeKey(callback: () => void, enabled: boolean, options: Options = {}) {
  const callbackEvent = useEffectEvent(callback);
  const { respectDefaultPrevented = false } = options;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (respectDefaultPrevented && e.defaultPrevented) return;
      callbackEvent();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [enabled, respectDefaultPrevented]);
}
