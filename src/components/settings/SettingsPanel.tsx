import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, X } from "lucide-react";
import { useEffect } from "react";
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
    handleLabelBlur,
    handleAdd,
    handleRemove,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  } = useStatusEdit(statuses, { onStatusesChange });

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleChangeDirectory = async () => {
    const path = await invoke<string | null>("pick_directory");
    if (path === null || path === currentDir) return;
    await invoke("set_workspace_directory", { path });
    onDirectoryChange(path);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-pointer"
        onClick={onClose}
        aria-label="Close settings"
      />
      <div className="relative w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto rounded-2xl border border-cork-border/60 bg-cork-surface/95 backdrop-blur-xl p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between gap-3">
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
          <button
            type="button"
            onClick={handleChangeDirectory}
            aria-label="Change workspace directory"
            className="flex w-full items-center gap-2 rounded-lg border border-cork-border/40 bg-cork-elevated/60 px-3 py-2 text-left text-xs font-mono text-cork-text cursor-pointer transition-colors hover:bg-cork-elevated/90 hover:border-cork-border/60"
          >
            <span className="flex-1 truncate">{currentDir}</span>
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
          onLabelBlur={handleLabelBlur}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onRemove={handleRemove}
          onAdd={handleAdd}
        />
      </div>
    </div>
  );
}

export default SettingsPanel;
