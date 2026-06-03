import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { StatusEntry } from "../types";
import type { EditingEntry } from "../types/settings";

export function useStatusEdit(initialStatuses: StatusEntry[]) {
  const [editing, setEditing] = useState<EditingEntry[]>(() =>
    initialStatuses.map((s) => ({ ...s, _key: crypto.randomUUID() })),
  );
  const [error, setError] = useState<string | null>(null);

  const handleLabelChange = (index: number, label: string) => {
    setEditing((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], label };
      return next;
    });
  };

  const handleAdd = () => {
    setEditing((prev) => [...prev, { label: "", _key: crypto.randomUUID() }]);
  };

  const handleRemove = (index: number) => {
    setEditing((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    setEditing((prev) => {
      if (index === 0) return prev;
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const handleMoveDown = (index: number) => {
    setEditing((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    const valid = editing.filter((s) => s.label.trim().length > 0);
    if (valid.length === 0) return;
    const labels = valid.map((s) => s.label.trim().toLowerCase());
    if (new Set(labels).size !== labels.length) {
      setError("Duplicate labels are not allowed.");
      return;
    }
    setError(null);
    await invoke("save_statuses", { statuses: valid });
  };

  return {
    editing,
    error,
    handleLabelChange,
    handleAdd,
    handleRemove,
    handleMoveUp,
    handleMoveDown,
    handleSave,
  };
}
