import { DragDropProvider } from "@dnd-kit/react";
import { Copy, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { getTask, onOpenSettings, pickDirectory, setWorkspaceDirectory } from "@/api";
import { Button, Heading, Text } from "@/components/atoms";
import { ContextMenu, FilterButton, SearchBar, type SearchBarHandle } from "@/components/molecules";
import { CreateTaskDialog, KanbanColumn, TaskDetailDialog } from "@/components/organisms/board";
import { SettingsDialog } from "@/components/organisms/settings";
import { AppHeader, Modal, TagFilterPopover } from "@/components/organisms/shell";
import { BoardLayout } from "@/components/templates";
import { useBoardDragState } from "@/hooks/useBoardDragState";
import { useStatusEdit } from "@/hooks/useStatusEdit";
import { UNKNOWN_STATUS } from "@/lib/board";
import { isValidFilter } from "@/lib/filter";
import type { StatusEntry, TagFilter, Task, TaskUpdates } from "@/types";

export type BoardPageProps = {
  dir: string;
  tasks: Task[];
  statuses: StatusEntry[];
  searchQuery: string;
  filters: TagFilter[];
  availableTags: string[];
  loadTasks: () => void;
  loadStatuses: () => void;
  setDir: (path: string) => void;
  onSearchChange: (value: string) => void;
  onFiltersChange: (next: TagFilter[]) => void;
  createTask: (title: string, status: string, body?: string, tags?: string[]) => Promise<void>;
  updateTask: (taskId: string, updates: TaskUpdates) => Promise<Task>;
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
  searchQuery,
  filters,
  availableTags,
  loadTasks,
  loadStatuses,
  setDir,
  onSearchChange,
  onFiltersChange,
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

  const [filterOpen, setFilterOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const searchBarRef = useRef<SearchBarHandle>(null);
  const validFilterCount = useMemo(() => filters.filter(isValidFilter).length, [filters]);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [preselectedStatus, setPreselectedStatus] = useState<string | undefined>(undefined);
  const openCreateDialog = (status?: string) => {
    setPreselectedStatus(status);
    setCreateDialogOpen(true);
  };
  const closeCreateDialog = () => setCreateDialogOpen(false);

  const [detailDialogTask, setDetailDialogTask] = useState<Task | null>(null);
  const [lastDetailDialogTask, setLastDetailDialogTask] = useState<Task | null>(null);
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

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    taskId: string;
  } | null>(null);

  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<string | null>(null);

  const handleCardContextMenu = useCallback((e: React.MouseEvent, taskId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, taskId });
  }, []);

  const handleContextMenuCopyPath = useCallback(async (taskId: string) => {
    try {
      await navigator.clipboard.writeText(taskId);
      toast.success("Copied path to clipboard");
    } catch {
      toast.error("Failed to copy path to clipboard");
    }
  }, []);

  const handleContextMenuDelete = useCallback((taskId: string) => {
    setDeleteConfirmTaskId(taskId);
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
      onTaskStatusUpdate: updateTaskStatus,
      onTaskOrderUpdate: updateTaskOrder,
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
                <SearchBar ref={searchBarRef} value={searchQuery} onChange={onSearchChange} />
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
        onFiltersChange={onFiltersChange}
        availableTags={availableTags}
      />
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
      <ContextMenu
        position={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null}
        onClose={() => setContextMenu(null)}
        items={[
          {
            label: "Copy path",
            icon: <Copy className="size-3.5" />,
            onClick: () => {
              if (contextMenu) handleContextMenuCopyPath(contextMenu.taskId);
            },
          },
          {
            label: "Delete",
            icon: <Trash2 className="size-3.5" />,
            color: "danger",
            onClick: () => {
              if (contextMenu) handleContextMenuDelete(contextMenu.taskId);
            },
          },
        ]}
      />
      {deleteConfirmTaskId && tasksById.has(deleteConfirmTaskId) && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteConfirmTaskId(null)}
          closeAriaLabel="Cancel delete"
          containerClassName="max-w-sm"
        >
          <div className="flex flex-col gap-4">
            <Heading level={2} variant="page">
              Delete task?
            </Heading>
            <Text size="sm" className="text-cork-muted">
              This will permanently delete &ldquo;
              {tasksById.get(deleteConfirmTaskId)?.title}&rdquo;. This action cannot be undone.
            </Text>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="md" onClick={() => setDeleteConfirmTaskId(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                color="danger"
                size="md"
                onClick={() => {
                  handleDeleteTask(deleteConfirmTaskId);
                  setDeleteConfirmTaskId(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </Modal>
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
