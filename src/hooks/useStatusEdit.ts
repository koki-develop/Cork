import { move } from "@dnd-kit/helpers";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/react";
import { useEffect, useRef, useState } from "react";

import { saveStatuses } from "@/api";
import {
  buildCandidateStatuses,
  buildRenameMap,
  hasDuplicateLabel,
  labelKey,
  statusEntriesEqual,
} from "@/lib/statuses";
import type { EditingEntry, StatusEntry } from "@/types";

type Options = {
  onStatusesChange: () => void;
  onTasksChange?: () => void;
};

export function useStatusEdit(
  initialStatuses: StatusEntry[],
  { onStatusesChange, onTasksChange }: Options,
) {
  const [editing, setEditing] = useState<EditingEntry[]>(() =>
    initialStatuses.map((s) => ({ ...s, id: crypto.randomUUID() })),
  );
  const [dragSnapshot, setDragSnapshot] = useState<EditingEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const lastPersisted = useRef<StatusEntry[]>(initialStatuses.map((s) => ({ label: s.label })));
  const persistedLabelsById = useRef<Map<string, string>>(
    new Map(editing.map((e) => [e.id, e.label])),
  );

  const initialKey = labelKey(initialStatuses);

  useEffect(() => {
    if (initialKey === labelKey(lastPersisted.current)) return;
    const mapped = initialStatuses.map((s) => ({
      ...s,
      id: crypto.randomUUID(),
    }));
    setEditing(mapped);
    setDragSnapshot(null);
    setError(null);
    lastPersisted.current = initialStatuses.map((s) => ({ label: s.label }));
    persistedLabelsById.current = new Map(mapped.map((e) => [e.id, e.label]));
  }, [initialKey, initialStatuses]);

  const persist = async (next: EditingEntry[]): Promise<boolean> => {
    const candidate = buildCandidateStatuses(next);

    if (hasDuplicateLabel(candidate)) {
      setError("Duplicate labels are not allowed.");
      return false;
    }
    setError(null);

    if (statusEntriesEqual(candidate, lastPersisted.current)) return true;

    const renameMap =
      candidate.length === lastPersisted.current.length
        ? buildRenameMap(next, persistedLabelsById.current)
        : {};

    await saveStatuses(candidate, renameMap);
    lastPersisted.current = candidate;
    persistedLabelsById.current = new Map(next.map((e) => [e.id, e.label.trim()]));
    onStatusesChange();
    if (Object.keys(renameMap).length > 0) {
      onTasksChange?.();
    }
    return true;
  };

  const handleLabelChange = (index: number, label: string) => {
    setEditing((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], label };
      return next;
    });
  };

  const handleAdd = () => {
    const id = crypto.randomUUID();
    setFocusId(id);
    setEditing((prev) => [...prev, { label: "", id }]);
  };

  const handleRemove = async (index: number) => {
    const next = editing.filter((_, i) => i !== index);
    setEditing(next);
    await persist(next);
  };

  const handleDragStart = (_event: DragStartEvent) => {
    setDragSnapshot(editing);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setEditing((prev) => move(prev, event));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (event.canceled && dragSnapshot) {
      setEditing(dragSnapshot);
      setDragSnapshot(null);
      return;
    }
    setDragSnapshot(null);
    await persist(editing);
  };

  const handleLabelBlur = async (index: number) => {
    const entry = editing[index];
    if (!entry) return;
    if (entry.label.trim() === "") {
      const next = editing.filter((_, i) => i !== index);
      setEditing(next);
      await persist(next);
      return;
    }
    await persist(editing);
  };

  const flush = async () => {
    const ok = await persist(editing);
    if (!ok) throw new Error("Duplicate labels are not allowed.");
  };

  const reset = () => {
    const mapped = initialStatuses.map((s) => ({
      ...s,
      id: crypto.randomUUID(),
    }));
    setEditing(mapped);
    persistedLabelsById.current = new Map(mapped.map((e) => [e.id, e.label]));
    setError(null);
  };

  return {
    editing,
    error,
    focusId,
    flush,
    reset,
    handleLabelChange,
    handleLabelBlur,
    handleAdd,
    handleRemove,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  };
}
