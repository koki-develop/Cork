import { invoke } from "@tauri-apps/api/core";
import type { StoredFilter, TagFilter, Task, TaskUpdates } from "@/types";

const toPayload = (f: TagFilter): StoredFilter =>
  "tags" in f
    ? { operator: f.operator, tags: f.tags }
    : { operator: f.operator };

export const listTasks = (query?: string, filters?: TagFilter[]) => {
  const payload: { query?: string; filters?: StoredFilter[] } = {};
  if (query) payload.query = query;
  if (filters && filters.length > 0) {
    payload.filters = filters.map(toPayload);
  }
  return invoke<Task[]>("list_tasks", payload);
};

export const listAllTags = () => invoke<string[]>("list_all_tags");

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
