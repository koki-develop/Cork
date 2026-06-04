import { watch } from "@tauri-apps/plugin-fs";
import { useEffect, useState } from "react";
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
    updateTaskStatus,
    updateTaskOrder,
    renumberTasks,
    reorderStatuses,
  };
}
