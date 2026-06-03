import { move } from "@dnd-kit/helpers";
import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/react";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { StatusEntry } from "../types";
import type { EditingEntry } from "../types/settings";

export function useStatusEdit(initialStatuses: StatusEntry[]) {
  const [editing, setEditing] = useState<EditingEntry[]>(() =>
    initialStatuses.map((s) => ({ ...s, id: crypto.randomUUID() })),
  );
  const [dragSnapshot, setDragSnapshot] = useState<EditingEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleRemove = (index: number) => {
    setEditing((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragStart = (_event: DragStartEvent) => {
    setDragSnapshot(editing);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setEditing((prev) => move(prev, event));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (event.canceled && dragSnapshot) {
      setEditing(dragSnapshot);
    }
    setDragSnapshot(null);
  };

  const handleSave = async (): Promise<boolean> => {
    const trimmed = editing
      .map((s) => s.label.trim())
      .filter((label) => label.length > 0);
    if (trimmed.length === 0) {
      setError(null);
      return true;
    }
    const lowered = trimmed.map((label) => label.toLowerCase());
    if (new Set(lowered).size !== lowered.length) {
      setError("Duplicate labels are not allowed.");
      return false;
    }
    setError(null);
    await invoke("save_statuses", {
      statuses: trimmed.map((label) => ({ label })),
    });
    return true;
  };

  const isDirty =
    editing.length !== initialStatuses.length ||
    editing.some((entry, i) => entry.label !== initialStatuses[i]?.label);

  return {
    editing,
    error,
    isDirty,
    handleLabelChange,
    handleAdd,
    handleRemove,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleSave,
  };
}
