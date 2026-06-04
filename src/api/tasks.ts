import { invoke } from "@tauri-apps/api/core";
import type { Task } from "@/types";

export const listTasks = () => invoke<Task[]>("list_tasks");

export const updateTaskStatus = (path: string, status: string) =>
  invoke<void>("update_task_status", { path, status });

export const updateTaskOrder = (path: string, order: number) =>
  invoke<void>("update_task_order", { path, order });

export const renumberTasks = (paths: string[]) =>
  invoke<void>("renumber_tasks", { paths });
