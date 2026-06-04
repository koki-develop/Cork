import { watch } from "@tauri-apps/plugin-fs";
import { useCallback, useEffect, useState } from "react";
import {
  getStatuses,
  getWorkspaceDirectory,
  listTasks,
  renumberTasks as renumberTasksApi,
  saveStatuses,
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

  const loadTasks = useCallback(async () => {
    const result = await listTasks();
    setTasks(result);
  }, []);

  const loadStatuses = useCallback(async () => {
    const result = await getStatuses();
    setStatuses(result.length > 0 ? result : DEFAULT_STATUSES);
  }, []);

  useEffect(() => {
    getWorkspaceDirectory()
      .then((path) => setDir(path))
      .catch((err) => console.error("failed to restore directory:", err));
  }, []);

  useEffect(() => {
    if (!dir) return;

    const loadData = async () => {
      try {
        const [loadedTasks, loadedStatuses] = await Promise.all([
          listTasks(),
          getStatuses(),
        ]);
        setTasks(loadedTasks);
        setStatuses(
          loadedStatuses.length > 0 ? loadedStatuses : DEFAULT_STATUSES,
        );
      } catch (err) {
        console.error("failed to load workspace:", err);
      }
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
    watchPromise.catch((err) => console.error("watch failed:", err));

    return () => {
      watchPromise.then((unwatch) => unwatch());
    };
  }, [dir, loadTasks, loadStatuses]);

  const updateTaskStatus = useCallback(
    async (taskId: string, newStatus: string) => {
      const prev = tasks;
      setTasks((prevTasks) =>
        prevTasks.map((t) =>
          t.id === taskId ? { ...t, status: newStatus } : t,
        ),
      );
      try {
        await updateTaskStatusApi(taskId, newStatus);
        await loadTasks();
      } catch (err) {
        console.error("failed to update task status:", err);
        setTasks(prev);
      }
    },
    [loadTasks, tasks],
  );

  const updateTaskOrder = useCallback(async (taskId: string, order: number) => {
    try {
      await updateTaskOrderApi(taskId, order);
    } catch (err) {
      console.error("failed to update task order:", err);
    }
  }, []);

  const renumberTasks = useCallback(async (paths: string[]) => {
    try {
      await renumberTasksApi(paths);
    } catch (err) {
      console.error("failed to renumber tasks:", err);
    }
  }, []);

  const reorderStatuses = useCallback(
    async (newStatuses: StatusEntry[]) => {
      await saveStatuses(newStatuses);
      await loadStatuses();
    },
    [loadStatuses],
  );

  return {
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
  };
}
