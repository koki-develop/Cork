import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useStatusEdit } from "../../hooks/useStatusEdit";
import type { StatusEntry } from "../../types";
import Button from "../ui/Button";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
        onClick={onClose}
        aria-label="Close settings"
      />
      <div className="relative w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto rounded-2xl border border-cork-border/60 bg-cork-surface/95 backdrop-blur-xl p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Settings</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="mb-5">
          <span className="mb-1.5 block text-xs font-medium text-cork-muted uppercase tracking-wider">
            Workspace Directory
          </span>
          <p className="truncate rounded-lg border border-cork-border/40 bg-cork-elevated/60 px-3 py-2 text-xs font-mono text-cork-muted">
            {currentDir}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
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
          <Button variant="secondary" size="md" onClick={handleChangeDirectory}>
            Change Directory
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={onClose}
            className="ml-auto"
          >
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={handleSaveAndClose}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
