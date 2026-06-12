import { useCallback, useEffect, useMemo, useRef } from "react";

export type DebouncedCallback<Args extends unknown[]> = {
  (...args: Args): void;
  /** Run the pending call now (with its last args), clearing the timer. No-op if nothing is pending. */
  flush: () => void;
  /** Drop any pending call without running it. */
  cancel: () => void;
};

/**
 * Trailing-edge debounce for a side-effecting callback. Each call resets the
 * timer and remembers its args; only the final call within a quiet `delayMs`
 * window actually fires. `flush()` forces the pending call immediately (e.g. on
 * blur or right before an explicit save), `cancel()` drops it (e.g. when a
 * different code path has already taken over persistence).
 *
 * The callback is read through a ref, so the freshest closure runs even though
 * `flush` / `cancel` / the debounced fn keep stable identities — callers can
 * list them in dependency arrays without re-subscribing every render.
 *
 * A still-pending timer is cancelled (NOT flushed) on unmount: it must never
 * fire into an unmounted tree. Every path that *must* persist a pending value
 * is responsible for calling `flush()` before it tears the component down.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
): DebouncedCallback<Args> {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<Args | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingArgsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const args = pendingArgsRef.current;
    pendingArgsRef.current = null;
    if (args !== null) callbackRef.current(...args);
  }, []);

  const debounced = useCallback(
    (...args: Args) => {
      pendingArgsRef.current = args;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingArgsRef.current;
        pendingArgsRef.current = null;
        if (pending !== null) callbackRef.current(...pending);
      }, delayMs);
    },
    [delayMs],
  );

  useEffect(() => cancel, [cancel]);

  return useMemo(() => Object.assign(debounced, { flush, cancel }), [debounced, flush, cancel]);
}
