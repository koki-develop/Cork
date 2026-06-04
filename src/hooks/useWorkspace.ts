import { watch } from "@tauri-apps/plugin-fs";
import { useEffect, useState } from "react";
import {
  createTask as createTaskApi,
  deleteTask as deleteTaskApi,
  getStatuses,
  getWorkspaceDirectory,
  listTasks,
  renumberTasks as renumberTasksApi,
  saveStatuses,
  updateTask as updateTaskApi,
  updateTaskOrder as updateTaskOrderApi,
  updateTaskStatus as updateTaskStatusApi,
} from "@/api";
import type { StatusEntry, Task } from "@/types";

const DEFAULT_STATUSES: StatusEntry[] = [
  { label: "Todo" },
  { label: "Doing" },
  { label: "Done" },
];

export function useWorkspace() {
  const [dir, setDir] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statuses, setStatuses] = useState<StatusEntry[]>(DEFAULT_STATUSES);

  const loadTasks = async () => {
    const result = await listTasks();
    setTasks(result);
  };

  const loadStatuses = async () => {
    const result = await getStatuses();
    setStatuses(result.length > 0 ? result : DEFAULT_STATUSES);
  };

  useEffect(() => {
    getWorkspaceDirectory().then((path) => setDir(path));
  }, []);

  useEffect(() => {
    if (!dir) return;

    const loadData = async () => {
      const [loadedTasks, loadedStatuses] = await Promise.all([
        listTasks(),
        getStatuses(),
      ]);
      setTasks(loadedTasks);
      setStatuses(
        loadedStatuses.length > 0 ? loadedStatuses : DEFAULT_STATUSES,
      );
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
          loadTasks();
        } else if (hasMdFile) {
          loadTasks();
        }
      },
      { recursive: false, delayMs: 300 },
    );

    return () => {
      watchPromise.then((unwatch) => unwatch());
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: auto-memoized by React Compiler
  }, [dir, loadTasks, loadStatuses]);

  const createTask = async (title: string, status: string, body?: string) => {
    const orders = tasks
      .filter((t) => t.status === status)
      .map((t) => t.order)
      .filter((o): o is number => o !== null);
    const order = orders.length === 0 ? 0 : Math.min(...orders) - 1;
    const task = await createTaskApi(title, status, body, order);
    setTasks((prev) => [...prev, task]);
    await loadTasks();
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

  const updateTask = async (
    taskId: string,
    updates: { title?: string; status?: string; body?: string; order?: number },
  ) => {
    const task = tasks.find((t) => t.id === taskId);
    const updatesWithOrder: {
      title?: string;
      status?: string;
      body?: string;
      order?: number;
    } = { ...updates };
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
            }
          : t,
      ),
    );
    try {
      const result = await updateTaskApi(taskId, updatesWithOrder);
      await loadTasks();
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
  };

  const reorderStatuses = async (newStatuses: StatusEntry[]) => {
    await saveStatuses(newStatuses);
    await loadStatuses();
  };

  return {
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
  };
}
