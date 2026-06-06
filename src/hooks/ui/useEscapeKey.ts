import { useEffect, useEffectEvent } from "react";

export function useEscapeKey(callback: () => void, enabled: boolean) {
  const callbackEvent = useEffectEvent(callback);

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      callbackEvent();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [enabled]);
}
