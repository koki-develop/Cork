import { invoke } from "@tauri-apps/api/core";
import { watch } from "@tauri-apps/plugin-fs";
import { useEffect, useState } from "react";
import Board from "./Board";
import DirectoryPicker from "./DirectoryPicker";
import type { StatusEntry, Task } from "./types";

const DEFAULT_STATUSES: StatusEntry[] = [
  { label: "Todo" },
  { label: "Doing" },
  { label: "Done" },
];

function App() {
  const [dir, setDir] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statuses, setStatuses] = useState<StatusEntry[]>(DEFAULT_STATUSES);

  const loadTasks = async () => {
    const result = await invoke<Task[]>("list_tasks");
    setTasks(result);
  };

  const loadStatuses = async () => {
    const result = await invoke<StatusEntry[]>("get_statuses");
    setStatuses(result.length > 0 ? result : DEFAULT_STATUSES);
  };

  useEffect(() => {
    invoke<string | null>("get_workspace_directory")
      .then((path) => setDir(path))
      .catch((err) => console.error("failed to restore directory:", err));
  }, []);

  useEffect(() => {
    if (!dir) return;

    loadTasks();
    loadStatuses();

    const w = watch(
      dir,
      (event) => {
        const hasMdFile = event.paths.some((p: string) => p.endsWith(".md"));
        if (hasMdFile) {
          loadTasks();
        }
      },
      { recursive: false, delayMs: 300 },
    );

    return () => {
      w.then((unwatch) => unwatch());
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies(loadTasks): auto-memoized by React Compiler
    // biome-ignore lint/correctness/useExhaustiveDependencies(loadStatuses): auto-memoized by React Compiler
  }, [dir, loadTasks, loadStatuses]);

  if (!dir) {
    return <DirectoryPicker onDirectorySelected={setDir} />;
  }

  return (
    <Board
      tasks={tasks}
      statuses={statuses}
      onStatusChange={loadTasks}
      onStatusesChange={loadStatuses}
      currentDir={dir}
      onDirectoryChange={setDir}
    />
  );
}

export default App;
