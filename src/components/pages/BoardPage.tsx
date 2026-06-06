import { DragDropProvider } from "@dnd-kit/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { getTask, onOpenSettings, pickDirectory, setWorkspaceDirectory } from "@/api";
import { FilterButton, SearchBar, type SearchBarHandle } from "@/components/molecules";
import {
  CreateTaskDialog,
  DeleteTaskConfirmDialog,
  KanbanColumn,
  TaskContextMenu,
  type TaskContextMenuState,
  TaskDetailDialog,
} from "@/components/organisms/board";
import { SettingsDialog } from "@/components/organisms/settings";
import { AppHeader, TagFilterPopover } from "@/components/organisms/shell";
import { BoardLayout } from "@/components/templates";
import { useBoardDragState } from "@/hooks/useBoardDragState";
import { useStatusEdit } from "@/hooks/useStatusEdit";
import { useWorkspace } from "@/hooks/useWorkspace";
import { UNKNOWN_STATUS } from "@/lib/board";
import { isValidFilter } from "@/lib/filter";
import type { Task, TaskUpdates } from "@/types";

export type BoardPageProps = {
  dir: string;
  setDir: (path: string) => void;
};

export function BoardPage({ dir, setDir }: BoardPageProps) {
  const {
    tasks,
    query,
    statuses,
    filters,
    availableTags,
    setQuery,
    setFilters,
    loadTasks,
    loadStatuses,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    renumberTasks,
    reorderStatuses,
  } = useWorkspace(dir);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = () => setSettingsOpen(true);

  const [filterOpen, setFilterOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const searchBarRef = useRef<SearchBarHandle>(null);
  const validFilterCount = useMemo(() => filters.filter(isValidFilter).length, [filters]);

  // `*Token` values are remount keys for the dialogs: bumping a token on each
  // open forces the child to remount and re-initialize its form state, while
  // leaving it unchanged on close so the Modal's exit animation still plays.
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogToken, setCreateDialogToken] = useState(0);
  const [preselectedStatus, setPreselectedStatus] = useState<string | undefined>(undefined);
  const openCreateDialog = (status?: string) => {
    setPreselectedStatus(status);
    setCreateDialogToken((t) => t + 1);
    setCreateDialogOpen(true);
  };
  const closeCreateDialog = () => setCreateDialogOpen(false);

  const [detailDialogTask, setDetailDialogTask] = useState<Task | null>(null);
  const [lastDetailDialogTask, setLastDetailDialogTask] = useState<Task | null>(null);
  const [detailDialogToken, setDetailDialogToken] = useState(0);
  if (detailDialogTask && detailDialogTask !== lastDetailDialogTask) {
    setLastDetailDialogTask(detailDialogTask);
  }
  const openDetailDialog = async (taskId: string) => {
    const task = tasksById.get(taskId);
    if (!task) return;
    const fullTask = await getTask(task.id);
    setDetailDialogToken((t) => t + 1);
    setDetailDialogTask(fullTask);
  };
  const closeDetailDialog = () => setDetailDialogTask(null);

  const [contextMenu, setContextMenu] = useState<TaskContextMenuState | null>(null);
  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<string | null>(null);

  const handleCardContextMenu = useCallback((e: React.MouseEvent, taskId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, taskId });
  }, []);

  useEffect(() => {
    const unlisten = onOpenSettings(() => setSettingsOpen(true));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const anyDialogOpen =
    settingsOpen ||
    createDialogOpen ||
    detailDialogTask !== null ||
    deleteConfirmTaskId !== null ||
    contextMenu !== null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (anyDialogOpen) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey) return;
      if (e.key.toLowerCase() !== "f") return;
      e.preventDefault();
      searchBarRef.current?.focus();
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [anyDialogOpen]);

  const { columnOrder, tasksByColumn, tasksById, handleDragOver, handleDragEnd } =
    useBoardDragState({
      statuses,
      tasks,
      onReorderStatuses: reorderStatuses,
      onMoveTask: moveTask,
      onRenumberTasks: renumberTasks,
    });

  const {
    editing,
    error,
    focusId,
    flush: flushStatuses,
    reset: resetStatuses,
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

  const handleCreateTask = async (title: string, status: string, body: string, tags: string[]) => {
    await createTask(title, status, body, tags);
    toast.success("Task created");
  };

  const handleSaveTask = async (taskId: string, updates: TaskUpdates) => {
    const result = await updateTask(taskId, updates);
    setDetailDialogTask(result);
  };

  const handleDeleteTask = async (taskId: string) => {
    await deleteTask(taskId);
    toast.success("Task deleted");
    closeDetailDialog();
  };

  const handleSettingsClose = async () => {
    try {
      await flushStatuses();
    } catch (e) {
      toast.error(String(e));
      resetStatuses();
    }
    setSettingsOpen(false);
  };

  const handlePickDirectory = async () => {
    const path = await pickDirectory();
    if (path === null || path === dir) return;
    await setWorkspaceDirectory(path);
    setDir(path);
  };

  const deleteConfirmTask = deleteConfirmTaskId ? tasksById.get(deleteConfirmTaskId) : undefined;

  return (
    <>
      <DragDropProvider onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <BoardLayout
          header={
            <AppHeader currentDir={dir} taskCount={tasks.length} onOpenSettings={openSettings} />
          }
          toolbar={
            <div className="flex items-center gap-4 px-6 pt-6 pb-0">
              <div className="min-w-0 flex-1">
                <SearchBar ref={searchBarRef} value={query} onChange={setQuery} />
              </div>
              <FilterButton
                ref={filterButtonRef}
                count={validFilterCount}
                isOpen={filterOpen}
                onClick={() => setFilterOpen((prev) => !prev)}
              />
            </div>
          }
        >
          {columnOrder.map((label, i) => {
            const isUnknown = label === UNKNOWN_STATUS;
            if (isUnknown && (tasksByColumn[label] ?? []).length === 0) return null;
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
                onCardContextMenu={handleCardContextMenu}
                showNewTaskButton={!isUnknown}
                draggable={!isUnknown}
              />
            );
          })}
        </BoardLayout>
      </DragDropProvider>
      <TagFilterPopover
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        anchorRef={filterButtonRef}
        filters={filters}
        onFiltersChange={setFilters}
        availableTags={availableTags}
      />
      <CreateTaskDialog
        key={createDialogToken}
        isOpen={createDialogOpen}
        onClose={closeCreateDialog}
        statuses={statuses}
        preselectedStatus={preselectedStatus}
        availableTags={availableTags}
        onCreateTask={handleCreateTask}
      />
      {lastDetailDialogTask && (
        <TaskDetailDialog
          key={detailDialogToken}
          isOpen={detailDialogTask != null}
          onClose={closeDetailDialog}
          task={lastDetailDialogTask}
          statuses={statuses}
          availableTags={availableTags}
          onSaveTask={handleSaveTask}
          onDeleteTask={() => handleDeleteTask(lastDetailDialogTask.id)}
        />
      )}
      <TaskContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        onDelete={(taskId) => setDeleteConfirmTaskId(taskId)}
      />
      {deleteConfirmTask && (
        <DeleteTaskConfirmDialog
          isOpen={true}
          taskTitle={deleteConfirmTask.title}
          onCancel={() => setDeleteConfirmTaskId(null)}
          onConfirm={async () => {
            await handleDeleteTask(deleteConfirmTask.id);
            setDeleteConfirmTaskId(null);
          }}
        />
      )}
      <SettingsDialog
        isOpen={settingsOpen}
        onClose={handleSettingsClose}
        currentDir={dir}
        onPickDirectory={handlePickDirectory}
        editing={editing}
        error={error}
        focusId={focusId}
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
