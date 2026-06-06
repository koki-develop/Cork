import { useCallback, useMemo, useRef } from "react";

// Structurally identical to `TagEditorHandle` from `@/components/molecules/TagEditor`.
// Duplicated inline because hooks must not import from components — TS still
// type-checks the assignment because the shape is identical.
type TagEditorHandle = {
  flushPending: () => string;
};

export function useTagEditorController() {
  const ref = useRef<TagEditorHandle>(null);

  const flushPending = useCallback(() => ref.current?.flushPending() ?? "", []);

  const flushAndMerge = useCallback((tags: string[]): string[] => {
    const pending = ref.current?.flushPending() ?? "";
    return pending ? [...tags, pending] : tags;
  }, []);

  return useMemo(() => ({ ref, flushPending, flushAndMerge }), [flushPending, flushAndMerge]);
}
