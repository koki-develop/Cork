import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type { StatusEntry } from "./types";

type EditingEntry = StatusEntry & { _key: number };

type Props = {
  isOpen: boolean;
  statuses: StatusEntry[];
  currentDir: string;
  onClose: () => void;
  onDirectoryChange: (path: string) => void;
  onStatusesChange: () => void;
};

function SettingsPanel({
  isOpen,
  statuses,
  currentDir,
  onClose,
  onDirectoryChange,
  onStatusesChange,
}: Props) {
  const nextKey = useRef(0);
  const [editing, setEditing] = useState<EditingEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setEditing(statuses.map((s) => ({ ...s, _key: nextKey.current++ })));
    }
  }, [isOpen, statuses]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleChangeDirectory() {
    const path = await invoke<string | null>("select_directory");
    if (path) {
      onDirectoryChange(path);
      onClose();
    }
  }

  function handleLabelChange(index: number, label: string) {
    setEditing((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], label };
      return next;
    });
  }

  function handleAdd() {
    setEditing((prev) => [...prev, { label: "", _key: nextKey.current++ }]);
  }

  function handleRemove(index: number) {
    setEditing((prev) => prev.filter((_, i) => i !== index));
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    setEditing((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function handleMoveDown(index: number) {
    setEditing((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  async function handleSave() {
    const valid = editing.filter((s) => s.label.trim().length > 0);
    if (valid.length === 0) return;
    const labels = valid.map((s) => s.label.trim().toLowerCase());
    if (new Set(labels).size !== labels.length) {
      setError("Duplicate labels are not allowed.");
      return;
    }
    setError(null);
    await invoke("save_statuses", { statuses: valid });
    onStatusesChange();
    onClose();
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
        aria-label="Close settings"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div
          className="w-96 max-h-[80vh] overflow-y-auto rounded-lg bg-gray-800 p-6 text-white shadow-xl pointer-events-auto"
          role="dialog"
          aria-modal="true"
        >
          <h2 className="mb-4 text-xl font-bold">Settings</h2>

          <div className="mb-4">
            <span className="mb-1 block text-sm text-gray-400">
              Workspace Directory
            </span>
            <p className="truncate rounded bg-gray-700 px-3 py-2 text-sm font-mono">
              {currentDir}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded bg-red-900/50 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="mb-6">
            <span className="mb-2 block text-sm text-gray-400">Statuses</span>
            <div className="flex flex-col gap-1.5">
              {editing.map((s, i) => (
                <div key={s._key} className="flex items-center gap-1">
                  <input
                    type="text"
                    value={s.label}
                    onChange={(e) => handleLabelChange(i, e.target.value)}
                    className="min-w-0 flex-1 rounded bg-gray-700 px-2 py-1.5 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Status label"
                  />
                  <button
                    type="button"
                    onClick={() => handleMoveUp(i)}
                    disabled={i === 0}
                    className="rounded p-1 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDown(i)}
                    disabled={i === editing.length - 1}
                    className="rounded p-1 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(i)}
                    className="rounded p-1 text-red-400 hover:text-red-300 transition-colors"
                    aria-label="Remove status"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAdd}
              className="mt-2 w-full rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 transition-colors"
            >
              + Add Status
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleChangeDirectory}
              className="rounded bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-500 transition-colors"
            >
              Change Directory
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded bg-green-600 px-4 py-2 font-semibold hover:bg-green-500 transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-gray-600 px-4 py-2 font-semibold hover:bg-gray-500 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
