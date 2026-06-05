import { watch } from "@tauri-apps/plugin-fs";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createTask as createTaskApi,
  deleteTask as deleteTaskApi,
  getStatuses,
  getWorkspaceDirectory,
  listAllTags,
  listTasks,
  renumberTasks as renumberTasksApi,
  saveStatuses,
  updateTask as updateTaskApi,
  updateTaskOrder as updateTaskOrderApi,
  updateTaskStatus as updateTaskStatusApi,
} from "@/api";
import { useFilterStore } from "@/hooks/useFilterStore";
import type { StatusEntry, TagFilter, Task, TaskUpdates } from "@/types";

const DEFAULT_STATUSES: StatusEntry[] = [
  { label: "Todo" },
  { label: "Doing" },
  { label: "Done" },
];

export function useWorkspace() {
  const [dir, setDir] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [query, setQuery] = useState("");
  const queryRef = useRef(query);
  queryRef.current = query;
  const [statuses, setStatuses] = useState<StatusEntry[]>(DEFAULT_STATUSES);

  const [filters, setFilters] = useState<TagFilter[]>([]);
  const filtersRef = useRef<TagFilter[]>([]);
  filtersRef.current = filters;
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  const filterStore = useFilterStore(dir);
  const storedFilters = filterStore.filters;

  const requestIdRef = useRef(0);

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

  const loadStatuses = useCallback(async () => {
    const result = await getStatuses();
    setStatuses(result.length > 0 ? result : DEFAULT_STATUSES);
  }, []);

  useEffect(() => {
    getWorkspaceDirectory().then((path) => setDir(path));
  }, []);

  // Mirror filters from the store into local state. The store loads filters
  // asynchronously after `dir` changes; when that resolves we update filters,
  // which in turn triggers the data-loading effect below.
  useEffect(() => {
    setFilters(storedFilters);
    filtersRef.current = storedFilters;
  }, [storedFilters]);

  // Main data loading effect — re-fetches tasks whenever dir or filters
  // change. `filters` is in deps to trigger the effect (loadTasks reads
  // filtersRef.current).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `filters` is read via ref inside loadTasks, but listed here to trigger re-runs
  useEffect(() => {
    if (!dir) return;

    const loadData = async () => {
      const [, loadedStatuses] = await Promise.all([
        loadTasks(),
        getStatuses(),
      ]);
      setStatuses(
        loadedStatuses.length > 0 ? loadedStatuses : DEFAULT_STATUSES,
      );
      await loadAvailableTags();
    };
    loadData();

    const watchPromise = watch(
      dir,
      (event) => {
        const hasCorkConfig = event.paths.some(
          (p: string) => p.split(/[\\/]/).pop() === ".cork.json",
        );
        const hasMdFile = event.paths.some((p: string) => p.endsWith(".md"));
        if (hasCorkConfig) {
          loadStatuses();
          loadTasks().then(loadAvailableTags);
        } else if (hasMdFile) {
          loadTasks().then(loadAvailableTags);
        }
      },
      { recursive: false, delayMs: 300 },
    );

    return () => {
      watchPromise.then((unwatch) => unwatch());
    };
  }, [dir, filters, loadTasks, loadAvailableTags, loadStatuses]);

  const createTask = async (
    title: string,
    status: string,
    body?: string,
    tags?: string[],
  ) => {
    const orders = tasks
      .filter((t) => t.status === status)
      .map((t) => t.order)
      .filter((o): o is number => o !== null);
    const order = orders.length === 0 ? 0 : Math.min(...orders) - 1;
    const task = await createTaskApi(title, status, body, order, tags);
    setTasks((prev) => [...prev, task]);
    await loadTasks();
    await loadAvailableTags();
  };

  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    setTasks((prevTasks) =>
      prevTasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
    );
    await updateTaskStatusApi(taskId, newStatus);
    await loadTasks();
  };

  const updateTaskOrder = async (taskId: string, order: number) => {
    await updateTaskOrderApi(taskId, order);
  };

  const renumberTasks = async (paths: string[]) => {
    await renumberTasksApi(paths);
  };

  const updateTask = async (taskId: string, updates: TaskUpdates) => {
    const task = tasks.find((t) => t.id === taskId);
    const updatesWithOrder: TaskUpdates = { ...updates };
    if (
      updates.status !== undefined &&
      task &&
      updates.status !== task.status
    ) {
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
              ...(updates.status !== undefined
                ? { status: updates.status }
                : {}),
              ...(updates.body !== undefined ? { body: updates.body } : {}),
              ...(updatesWithOrder.order !== undefined
                ? { order: updatesWithOrder.order }
                : {}),
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
  };

  const deleteTask = async (taskId: string) => {
    await deleteTaskApi(taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    await loadAvailableTags();
  };

  const reorderStatuses = async (newStatuses: StatusEntry[]) => {
    await saveStatuses(newStatuses);
    await loadStatuses();
  };

  const handleQueryChange = (q: string) => {
    setQuery(q);
    queryRef.current = q;
    const id = ++requestIdRef.current;
    listTasks(
      q || undefined,
      filtersRef.current.length > 0 ? filtersRef.current : undefined,
    ).then((result) => {
      if (id === requestIdRef.current) setTasks(result);
    });
  };

  const handleFiltersChange = (next: TagFilter[]) => {
    setFilters(next);
    filtersRef.current = next;
    filterStore.scheduleSave(next);
    const id = ++requestIdRef.current;
    listTasks(
      queryRef.current || undefined,
      next.length > 0 ? next : undefined,
    ).then((result) => {
      if (id === requestIdRef.current) setTasks(result);
    });
  };

  return {
    dir,
    tasks,
    query,
    statuses,
    filters,
    availableTags,
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
    handleQueryChange,
    handleFiltersChange,
  };
}
