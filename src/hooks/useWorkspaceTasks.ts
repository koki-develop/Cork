import { useCallback, useEffect, useRef, useState } from "react";

import {
  createTask as createTaskApi,
  deleteTask as deleteTaskApi,
  listAllTags,
  listTasks,
  moveTask as moveTaskApi,
  renumberTasks as renumberTasksApi,
  updateTask as updateTaskApi,
} from "@/api";
import type { TagFilter, Task, TaskUpdates } from "@/types";

type Params = {
  dir: string | null;
  query: string;
  filters: TagFilter[];
};

export function useWorkspaceTasks({ dir, query, filters }: Params) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const requestIdRef = useRef(0);

  const queryRef = useRef(query);
  queryRef.current = query;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const loadTasks = useCallback(async () => {
    const id = ++requestIdRef.current;
    const result = await listTasks(
      queryRef.current || undefined,
      filtersRef.current.length > 0 ? filtersRef.current : undefined,
    );
    if (id === requestIdRef.current) setTasks(result);
  }, []);

  const loadAvailableTags = useCallback(async () => {
    const tags = await listAllTags();
    setAvailableTags(tags);
  }, []);

  // Tasks refetch whenever the search query or filters change. `availableTags`
  // is workspace-scoped (independent of query/filters), so it gets its own
  // dir-only effect below — refetching it per keystroke would hit the backend
  // unnecessarily.
  useEffect(() => {
    if (!dir) return;
    const id = ++requestIdRef.current;
    let cancelled = false;
    listTasks(query || undefined, filters.length > 0 ? filters : undefined).then((result) => {
      if (cancelled || id !== requestIdRef.current) return;
      setTasks(result);
    });
    return () => {
      cancelled = true;
    };
  }, [dir, query, filters]);

  useEffect(() => {
    if (!dir) return;
    loadAvailableTags();
  }, [dir, loadAvailableTags]);

  const createTask = useCallback(
    async (title: string, status: string, body?: string, tags?: string[]) => {
      const orders = tasks
        .filter((t) => t.status === status)
        .map((t) => t.order)
        .filter((o): o is number => o !== null);
      const order = orders.length === 0 ? 0 : Math.min(...orders) - 1;
      const task = await createTaskApi(title, status, body, order, tags);
      setTasks((prev) => [...prev, task]);
      await loadTasks();
      await loadAvailableTags();
    },
    [tasks, loadTasks, loadAvailableTags],
  );

  // Atomic move: persists status + order in a single backend call, and the
  // optimistic `setTasks` writes both fields together. Updating them
  // separately would briefly leave the moved task with the new status but
  // its old order, which `groupTasksByStatus` (array-order preserving) would
  // render at the wrong slot inside the target column.
  const moveTask = useCallback(
    async (taskId: string, status: string, order: number) => {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status, order } : t)));
      await moveTaskApi(taskId, status, order);
      await loadTasks();
    },
    [loadTasks],
  );

  const renumberTasks = useCallback(async (paths: string[]) => {
    await renumberTasksApi(paths);
  }, []);

  const updateTask = useCallback(
    async (taskId: string, updates: TaskUpdates) => {
      const task = tasks.find((t) => t.id === taskId);
      const updatesWithOrder: TaskUpdates = { ...updates };
      if (updates.status !== undefined && task && updates.status !== task.status) {
        const ordersInNewColumn = tasks
          .filter((t) => t.status === updates.status)
          .map((t) => t.order)
          .filter((o): o is number => o !== null);
        updatesWithOrder.order =
          ordersInNewColumn.length === 0 ? 0 : Math.min(...ordersInNewColumn) - 1;
      }

      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                ...(updates.title !== undefined ? { title: updates.title } : {}),
                ...(updates.status !== undefined ? { status: updates.status } : {}),
                ...(updates.body !== undefined ? { body: updates.body } : {}),
                ...(updatesWithOrder.order !== undefined ? { order: updatesWithOrder.order } : {}),
                ...(updates.tags !== undefined ? { tags: updates.tags } : {}),
              }
            : t,
        ),
      );
      try {
        const result = await updateTaskApi(taskId, updatesWithOrder);
        await loadTasks();
        await loadAvailableTags();
        return result;
      } catch (e) {
        if (task) {
          setTasks((prev) => prev.map((t) => (t.id === taskId ? task : t)));
        }
        throw e;
      }
    },
    [tasks, loadTasks, loadAvailableTags],
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      await deleteTaskApi(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      await loadAvailableTags();
    },
    [loadAvailableTags],
  );

  return {
    tasks,
    availableTags,
    loadTasks,
    loadAvailableTags,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    renumberTasks,
  };
}
