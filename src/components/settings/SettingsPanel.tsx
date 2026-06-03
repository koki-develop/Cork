import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { useStatusEdit } from "../../hooks/useStatusEdit";
import type { StatusEntry } from "../../types";
import StatusList from "./StatusList";

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
  const {
    editing,
    error,
    handleLabelChange,
    handleAdd,
    handleRemove,
    handleMoveUp,
    handleMoveDown,
    handleSave,
  } = useStatusEdit(statuses);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChangeDirectory = async () => {
    const path = await invoke<string | null>("select_directory");
    if (path) {
      onDirectoryChange(path);
      onClose();
    }
  };

  const handleSaveAndClose = async () => {
    await handleSave();
    onStatusesChange();
    onClose();
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
        aria-label="Close settings"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <dialog
          open
          className="w-96 max-h-[80vh] overflow-y-auto rounded-lg bg-gray-800 p-6 text-white shadow-xl pointer-events-auto"
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

          <StatusList
            editing={editing}
            onLabelChange={handleLabelChange}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onRemove={handleRemove}
            onAdd={handleAdd}
          />

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
              onClick={handleSaveAndClose}
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
        </dialog>
      </div>
    </div>
  );
}

export default SettingsPanel;
