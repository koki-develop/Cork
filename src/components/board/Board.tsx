import { DragDropProvider } from "@dnd-kit/react";
import { listen } from "@tauri-apps/api/event";
import { Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { useBoardDragState } from "../../hooks/useBoardDragState";
import type { StatusEntry, Task } from "../../types";
import SettingsPanel from "../settings/SettingsPanel";
import Button from "../ui/Button";
import Column from "./Column";

type Props = {
  tasks: Task[];
  statuses: StatusEntry[];
  onStatusesChange: () => void;
  currentDir: string;
  onDirectoryChange: (path: string) => void;
  onTaskStatusUpdate: (taskId: string, newStatus: string) => Promise<void>;
  onTaskOrderUpdate: (taskId: string, order: number) => Promise<void>;
  onRenumberTasks: (paths: string[]) => Promise<void>;
  onReorderStatuses: (statuses: StatusEntry[]) => Promise<void>;
};

function Board({
  tasks,
  statuses,
  onStatusesChange,
  currentDir,
  onDirectoryChange,
  onTaskStatusUpdate,
  onTaskOrderUpdate,
  onRenumberTasks,
  onReorderStatuses,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const handleClose = () => setSettingsOpen(false);

  useEffect(() => {
    const unlisten = listen("menu:open-settings", () => {
      setSettingsOpen(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const {
    columnOrder,
    tasksByColumn,
    tasksById,
    handleDragOver,
    handleDragEnd,
  } = useBoardDragState({
    statuses,
    tasks,
    onReorderStatuses,
    onTaskStatusUpdate,
    onTaskOrderUpdate,
    onRenumberTasks,
  });

  return (
    <>
      <DragDropProvider onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="flex h-screen flex-col overflow-hidden">
          <header className="flex shrink-0 items-center justify-between border-b border-cork-border/50 px-6 py-3">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold tracking-tight">Cork</h1>
              <span className="text-cork-muted text-xs font-mono truncate max-w-64">
                {currentDir}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-cork-muted">
                {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettingsOpen(true)}
                aria-label="Settings"
              >
                <Settings className="size-4" />
              </Button>
            </div>
          </header>

          <div className="flex flex-1 gap-5 overflow-x-auto overflow-y-hidden p-6">
            {columnOrder.map((label, i) => (
              <Column
                key={label}
                label={label}
                index={i}
                taskIds={tasksByColumn[label] ?? []}
                tasksById={tasksById}
              />
            ))}
          </div>
        </div>
      </DragDropProvider>
      <SettingsPanel
        key={String(settingsOpen)}
        isOpen={settingsOpen}
        statuses={statuses}
        currentDir={currentDir}
        onClose={handleClose}
        onDirectoryChange={onDirectoryChange}
        onStatusesChange={onStatusesChange}
      />
    </>
  );
}

export default Board;
