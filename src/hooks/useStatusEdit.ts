import { move } from "@dnd-kit/helpers";
import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/react";
import { useEffect, useRef, useState } from "react";
import { saveStatuses } from "@/api";
import { labelKey } from "@/lib/statuses";
import type { EditingEntry, StatusEntry } from "@/types";

type Options = {
  onStatusesChange: () => void;
};

export function useStatusEdit(
  initialStatuses: StatusEntry[],
  { onStatusesChange }: Options,
) {
  const [editing, setEditing] = useState<EditingEntry[]>(() =>
    initialStatuses.map((s) => ({ ...s, id: crypto.randomUUID() })),
  );
  const [dragSnapshot, setDragSnapshot] = useState<EditingEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastPersisted = useRef<StatusEntry[]>(
    initialStatuses.map((s) => ({ label: s.label })),
  );

  const initialKey = labelKey(initialStatuses);

  useEffect(() => {
    if (initialKey === labelKey(lastPersisted.current)) return;
    setEditing(initialStatuses.map((s) => ({ ...s, id: crypto.randomUUID() })));
    setDragSnapshot(null);
    setError(null);
    lastPersisted.current = initialStatuses.map((s) => ({ label: s.label }));
  }, [initialKey, initialStatuses]);

  const persist = async (next: EditingEntry[]): Promise<boolean> => {
    const trimmed = next
      .map((e) => e.label.trim())
      .filter((label) => label.length > 0);
    const lowered = trimmed.map((label) => label.toLowerCase());
    if (new Set(lowered).size !== lowered.length) {
      setError("Duplicate labels are not allowed.");
      return false;
    }
    setError(null);

    const candidate: StatusEntry[] = trimmed.map((label) => ({ label }));
    const prev = lastPersisted.current;
    const isSame =
      prev.length === candidate.length &&
      candidate.every((c, i) => c.label === prev[i]?.label);
    if (isSame) return true;

    await saveStatuses(candidate);
    lastPersisted.current = candidate;
    onStatusesChange();
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
    setEditing((prev) => [...prev, { label: "", id: crypto.randomUUID() }]);
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

  return {
    editing,
    error,
    handleLabelChange,
    handleLabelBlur,
    handleAdd,
    handleRemove,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  };
}
