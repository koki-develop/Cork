import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { Settings } from "lucide-react";
import { useCallback, useState } from "react";
import type { StatusEntry, Task } from "../../types";
import SettingsPanel from "../settings/SettingsPanel";
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
    async (result: DropResult) => {
      if (!result.destination) return;
      if (result.source.droppableId === result.destination.droppableId) return;
      await onTaskStatusUpdate(
        result.draggableId,
        result.destination.droppableId,
      );
    },
    [onTaskStatusUpdate],
  );

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
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
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="rounded-lg p-2 text-cork-muted transition-colors duration-200 hover:bg-cork-elevated hover:text-cork-text cursor-pointer"
                aria-label="Settings"
              >
                <Settings className="size-4" />
              </button>
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
      </DragDropContext>
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
