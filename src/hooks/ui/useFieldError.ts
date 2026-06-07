import { useCallback, useRef, useState } from "react";

/**
 * Dialog-level error tagged with the field it's attributed to. `field` is
 * `null` when the failure can't be pinned on a single field (e.g. a save
 * that bundled several updates).
 */
export type FieldError<Field extends string> = {
  message: string;
  field: Field | null;
};

/**
 * Dialog-error state that mirrors itself to a ref so async handlers can read
 * the latest value via `peek()` without dealing with stale closures from a
 * concurrent state update. `error` drives rendering; `peek()` is what you
 * want inside an `await` chain or right after firing a side-effect.
 */
export function useFieldError<Field extends string>() {
  const [error, setErrorState] = useState<FieldError<Field> | null>(null);
  const ref = useRef<FieldError<Field> | null>(null);

  const set = useCallback((next: FieldError<Field> | null) => {
    ref.current = next;
    setErrorState(next);
  }, []);

  const clear = useCallback(() => {
    ref.current = null;
    setErrorState(null);
  }, []);

  const peek = useCallback(() => ref.current, []);

  return { error, set, clear, peek };
}
