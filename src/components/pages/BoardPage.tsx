import { DragDropProvider } from "@dnd-kit/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getTask,
  onOpenSettings,
  pickDirectory,
  setWorkspaceDirectory,
} from "@/api";
import {
  CreateTaskDialog,
  KanbanColumn,
  TaskDetailDialog,
} from "@/components/organisms/board";
import { SettingsDialog } from "@/components/organisms/settings";
import { AppHeader } from "@/components/organisms/shell";
import { BoardLayout } from "@/components/templates";
import { useBoardDragState } from "@/hooks/useBoardDragState";
import { useStatusEdit } from "@/hooks/useStatusEdit";
import { UNKNOWN_STATUS } from "@/lib/board";
import type { StatusEntry, Task } from "@/types";

export type BoardPageProps = {
  dir: string;
  tasks: Task[];
  statuses: StatusEntry[];
  loadTasks: () => void;
  loadStatuses: () => void;
  setDir: (path: string) => void;
  createTask: (title: string, status: string, body?: string) => Promise<void>;
  updateTask: (
    taskId: string,
    updates: { title?: string; status?: string; body?: string },
  ) => Promise<Task>;
  deleteTask: (taskId: string) => Promise<void>;
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
  createTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  updateTaskOrder,
  renumberTasks,
  reorderStatuses,
}: BoardPageProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = () => setSettingsOpen(true);
  const closeSettings = () => setSettingsOpen(false);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [preselectedStatus, setPreselectedStatus] = useState<
    string | undefined
  >(undefined);
  const openCreateDialog = (status?: string) => {
    setPreselectedStatus(status);
    setCreateDialogOpen(true);
  };
  const closeCreateDialog = () => setCreateDialogOpen(false);

  const [detailDialogTask, setDetailDialogTask] = useState<Task | null>(null);
  const [lastDetailDialogTask, setLastDetailDialogTask] = useState<Task | null>(
    null,
  );
  if (detailDialogTask && detailDialogTask !== lastDetailDialogTask) {
    setLastDetailDialogTask(detailDialogTask);
  }
  const openDetailDialog = async (taskId: string) => {
    const task = tasksById.get(taskId);
    if (!task) return;
    const fullTask = await getTask(task.id);
    setDetailDialogTask(fullTask);
  };
  const closeDetailDialog = () => setDetailDialogTask(null);

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

  const handleCreateTask = async (
    title: string,
    status: string,
    body?: string,
  ) => {
    await createTask(title, status, body);
    toast.success("Task created");
  };

  const handleSaveTask = async (
    taskId: string,
    updates: { title?: string; status?: string; body?: string },
  ) => {
    const result = await updateTask(taskId, updates);
    setDetailDialogTask(result);
  };

  const handleDeleteTask = async (taskId: string) => {
    await deleteTask(taskId);
    toast.success("Task deleted");
    closeDetailDialog();
  };

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
          {columnOrder.map((label, i) => {
            const isUnknown = label === UNKNOWN_STATUS;
            if (isUnknown && (tasksByColumn[label] ?? []).length === 0)
              return null;
            return (
              <KanbanColumn
                key={label}
                label={label}
                displayLabel={isUnknown ? "Unknown" : undefined}
                index={i}
                taskIds={tasksByColumn[label] ?? []}
                tasksById={tasksById}
                onCreateTask={openCreateDialog}
                onCardClick={openDetailDialog}
                showNewTaskButton={!isUnknown}
                draggable={!isUnknown}
              />
            );
          })}
        </BoardLayout>
      </DragDropProvider>
      <CreateTaskDialog
        isOpen={createDialogOpen}
        onClose={closeCreateDialog}
        statuses={statuses}
        preselectedStatus={preselectedStatus}
        onCreateTask={handleCreateTask}
      />
      {lastDetailDialogTask && (
        <TaskDetailDialog
          isOpen={detailDialogTask != null}
          onClose={closeDetailDialog}
          task={lastDetailDialogTask}
          statuses={statuses}
          onSaveTask={handleSaveTask}
          onDeleteTask={() => handleDeleteTask(lastDetailDialogTask.id)}
        />
      )}
      <SettingsDialog
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
