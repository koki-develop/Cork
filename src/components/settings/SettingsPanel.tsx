import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
    isDirty: statusesDirty,
    handleLabelChange,
    handleAdd,
    handleRemove,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleSave,
  } = useStatusEdit(statuses);

  const [pendingDir, setPendingDir] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const hasPendingChanges = pendingDir !== null || statusesDirty;

  const discardAndClose = () => {
    setPendingDir(null);
    onClose();
  };

  const discardAndCloseRef = useRef(discardAndClose);
  useEffect(() => {
    discardAndCloseRef.current = discardAndClose;
  });

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        discardAndCloseRef.current();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const displayedDir = pendingDir ?? currentDir;

  const handleChangeDirectory = async () => {
    const path = await invoke<string | null>("pick_directory");
    if (path === null) return;
    setPendingDir(path === currentDir ? null : path);
  };

  const handleSaveAndClose = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const saved = await handleSave();
      if (!saved) return;

      if (pendingDir !== null) {
        await invoke("set_workspace_directory", { path: pendingDir });
        onDirectoryChange(pendingDir);
      } else {
        onStatusesChange();
      }

      setPendingDir(null);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
        onClick={discardAndClose}
        aria-label="Close settings"
      />
      <div className="relative w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto rounded-2xl border border-cork-border/60 bg-cork-surface/95 backdrop-blur-xl p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="text-lg font-bold tracking-tight">Settings</h2>
            {hasPendingChanges && (
              <span className="text-[10px] font-semibold text-cork-accent-hover uppercase tracking-wider truncate">
                • Unsaved changes
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={discardAndClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="mb-5">
          <span className="mb-1.5 block text-xs font-medium text-cork-muted uppercase tracking-wider">
            Workspace Directory
          </span>
          <button
            type="button"
            onClick={handleChangeDirectory}
            disabled={isSaving}
            aria-label="Change workspace directory"
            className="flex w-full items-center gap-2 rounded-lg border border-cork-border/40 bg-cork-elevated/60 px-3 py-2 text-left text-xs font-mono text-cork-text cursor-pointer transition-colors hover:bg-cork-elevated/90 hover:border-cork-border/60 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-cork-elevated/60 disabled:hover:border-cork-border/40"
          >
            <span className="flex-1 truncate">{displayedDir}</span>
            <FolderOpen className="size-3.5 shrink-0 text-cork-muted" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <StatusList
          editing={editing}
          onLabelChange={handleLabelChange}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onRemove={handleRemove}
          onAdd={handleAdd}
        />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={discardAndClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSaveAndClose}
            disabled={isSaving || !hasPendingChanges}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
