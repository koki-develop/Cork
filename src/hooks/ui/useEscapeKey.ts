import { useEffect, useEffectEvent } from "react";

import { isImeKeyEvent } from "@/lib/keyboard";

export function useEscapeKey(callback: () => void, enabled: boolean) {
  const callbackEvent = useEffectEvent(callback);

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Esc cancels an in-flight IME composition (e.g. Japanese kana → kanji
      // conversion). Letting it close the modal/popover too would surprise the
      // user — the keystroke belongs to the IME, not to us.
      if (isImeKeyEvent(e)) return;
      callbackEvent();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [enabled]);
}
