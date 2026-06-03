import { invoke } from "@tauri-apps/api/core";
import { watch } from "@tauri-apps/plugin-fs";
import { useCallback, useEffect, useState } from "react";
import type { StatusEntry, Task } from "../types";

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
    const result = await invoke<Task[]>("list_tasks");
    setTasks(result);
  }, []);

  const loadStatuses = useCallback(async () => {
    const result = await invoke<StatusEntry[]>("get_statuses");
    setStatuses(result.length > 0 ? result : DEFAULT_STATUSES);
  }, []);

  useEffect(() => {
    invoke<string | null>("get_workspace_directory")
      .then((path) => setDir(path))
      .catch((err) => console.error("failed to restore directory:", err));
  }, []);

  useEffect(() => {
    if (!dir) return;

    loadTasks();
    loadStatuses();

    const watchPromise = watch(
      dir,
      (event) => {
        const hasMdFile = event.paths.some((p: string) => p.endsWith(".md"));
        if (hasMdFile) {
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

  return { dir, tasks, statuses, loadTasks, loadStatuses, setDir };
}
