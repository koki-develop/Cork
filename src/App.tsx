import { invoke } from "@tauri-apps/api/core";
import { watch } from "@tauri-apps/plugin-fs";
import { useCallback, useEffect, useState } from "react";
import Board from "./Board";
import DirectoryPicker from "./DirectoryPicker";
import type { Task } from "./types";

function App() {
  const [dir, setDir] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const loadTasks = useCallback(async () => {
    const result = await invoke<Task[]>("list_tasks");
    setTasks(result);
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (!dir) return;

    loadTasks();

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
  }, [dir, loadTasks]);

  if (!dir) {
    return <DirectoryPicker onDirectorySelected={setDir} />;
  }

  return <Board tasks={tasks} onStatusChange={loadTasks} />;
}

export default App;
