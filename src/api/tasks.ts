import { invoke } from "@tauri-apps/api/core";
import type { Task, TaskUpdates } from "@/types";

export const listTasks = () => invoke<Task[]>("list_tasks");

export const getTask = (path: string) => invoke<Task>("get_task", { path });

export const createTask = (
  title: string,
  status: string,
  body?: string,
  order?: number,
  tags?: string[],
) => invoke<Task>("create_task", { title, status, body, order, tags });

export const updateTaskStatus = (path: string, status: string) =>
  invoke<void>("update_task_status", { path, status });

export const updateTaskOrder = (path: string, order: number) =>
  invoke<void>("update_task_order", { path, order });

export const renumberTasks = (paths: string[]) =>
  invoke<void>("renumber_tasks", { paths });

export const updateTask = (path: string, updates: TaskUpdates) =>
  invoke<Task>("update_task", { path, ...updates });

export const deleteTask = (path: string) =>
  invoke<void>("delete_task", { path });
