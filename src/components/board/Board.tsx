import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { Settings } from "lucide-react";
import { useCallback, useState } from "react";
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
};

function Board({
  tasks,
  statuses,
  onStatusesChange,
  currentDir,
  onDirectoryChange,
  onTaskStatusUpdate,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const handleClose = useCallback(() => setSettingsOpen(false), []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (event.canceled) return;
      const { source, target } = event.operation;
      if (!source || !target) return;
      const task = tasks.find((t) => t.id === String(source.id));
      if (!task || task.status === target.id) return;
      await onTaskStatusUpdate(String(source.id), String(target.id));
    },
    [onTaskStatusUpdate, tasks],
  );

  return (
    <>
      <DragDropProvider onDragEnd={handleDragEnd}>
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
            {statuses.map((s) => (
              <Column
                key={s.label}
                title={s.label}
                tasks={tasks.filter((t) => t.status === s.label)}
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
