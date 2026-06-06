import type { Task, TaskUpdates } from "@/types";

export type TaskFormSnapshot = Pick<Task, "title" | "status" | "body" | "tags">;

const tagsEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((t, i) => t === b[i]);

/**
 * Returns a TaskUpdates payload containing only fields whose `current` value
 * differs from `original`. An empty object means no diff — caller can skip
 * the save.
 */
export function computeDirtyUpdates(
  original: TaskFormSnapshot,
  current: TaskFormSnapshot,
): TaskUpdates {
  const updates: TaskUpdates = {};
  if (current.title !== original.title) updates.title = current.title;
  if (current.status !== original.status) updates.status = current.status;
  if (current.body !== original.body) updates.body = current.body;
  if (!tagsEqual(current.tags, original.tags)) updates.tags = current.tags;
  return updates;
}

/** Returns a new snapshot with `updates` applied; absent fields fall through. */
export function withTaskUpdates(
  snapshot: TaskFormSnapshot,
  updates: TaskUpdates,
): TaskFormSnapshot {
  return {
    title: updates.title ?? snapshot.title,
    status: updates.status ?? snapshot.status,
    body: updates.body ?? snapshot.body,
    tags: updates.tags ?? snapshot.tags,
  };
}
