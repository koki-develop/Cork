import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import Board from "./Board";
import DirectoryPicker from "./DirectoryPicker";
import type { Task } from "./types";

function App() {
  const [dir, setDir] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  const loadTasks = useCallback(async () => {
    if (!dir) return;
    const result = await invoke<Task[]>("list_tasks", { dir });
    setTasks(result);
  }, [dir]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  if (!dir) {
    return <DirectoryPicker onDirectorySelected={setDir} />;
  }

  return <Board tasks={tasks} onStatusChange={loadTasks} />;
}

export default App;
