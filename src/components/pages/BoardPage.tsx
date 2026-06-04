import { DragDropProvider } from "@dnd-kit/react";
import { useEffect, useState } from "react";
import { onOpenSettings, pickDirectory, setWorkspaceDirectory } from "@/api";
import { KanbanColumn } from "@/components/organisms/board";
import { SettingsDialog } from "@/components/organisms/settings";
import { AppHeader } from "@/components/organisms/shell";
import { BoardLayout } from "@/components/templates";
import { useBoardDragState } from "@/hooks/useBoardDragState";
import { useStatusEdit } from "@/hooks/useStatusEdit";
import type { StatusEntry, Task } from "@/types";

export type BoardPageProps = {
  dir: string;
  tasks: Task[];
  statuses: StatusEntry[];
  loadTasks: () => void;
  loadStatuses: () => void;
  setDir: (path: string) => void;
  updateTaskStatus: (taskId: string, newStatus: string) => Promise<void>;
  updateTaskOrder: (taskId: string, order: number) => Promise<void>;
  renumberTasks: (paths: string[]) => Promise<void>;
  reorderStatuses: (statuses: StatusEntry[]) => Promise<void>;
};

export function BoardPage({
  dir,
  tasks,
  statuses,
  loadTasks,
  loadStatuses,
  setDir,
  updateTaskStatus,
  updateTaskOrder,
  renumberTasks,
  reorderStatuses,
}: BoardPageProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = () => setSettingsOpen(true);
  const closeSettings = () => setSettingsOpen(false);

  useEffect(() => {
    const unlisten = onOpenSettings(() => setSettingsOpen(true));
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
    onReorderStatuses: reorderStatuses,
    onTaskStatusUpdate: updateTaskStatus,
    onTaskOrderUpdate: updateTaskOrder,
    onRenumberTasks: renumberTasks,
  });

  const {
    editing,
    error,
    handleLabelChange,
    handleLabelBlur,
    handleAdd,
    handleRemove,
    handleDragStart: handleStatusDragStart,
    handleDragOver: handleStatusDragOver,
    handleDragEnd: handleStatusDragEnd,
  } = useStatusEdit(statuses, {
    onStatusesChange: loadStatuses,
    onTasksChange: loadTasks,
  });

  const handlePickDirectory = async () => {
    const path = await pickDirectory();
    if (path === null || path === dir) return;
    await setWorkspaceDirectory(path);
    setDir(path);
  };

  return (
    <>
      <DragDropProvider onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <BoardLayout
          header={
            <AppHeader
              currentDir={dir}
              taskCount={tasks.length}
              onOpenSettings={openSettings}
            />
          }
        >
          {columnOrder.map((label, i) => (
            <KanbanColumn
              key={label}
              label={label}
              index={i}
              taskIds={tasksByColumn[label] ?? []}
              tasksById={tasksById}
            />
          ))}
        </BoardLayout>
      </DragDropProvider>
      <SettingsDialog
        key={String(settingsOpen)}
        isOpen={settingsOpen}
        onClose={closeSettings}
        currentDir={dir}
        onPickDirectory={handlePickDirectory}
        editing={editing}
        error={error}
        onLabelChange={handleLabelChange}
        onLabelBlur={handleLabelBlur}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onDragStart={handleStatusDragStart}
        onDragOver={handleStatusDragOver}
        onDragEnd={handleStatusDragEnd}
      />
    </>
  );
}
