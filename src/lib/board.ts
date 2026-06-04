import type { StatusEntry, Task } from "@/types";

export function groupTasksByStatus(
  statuses: StatusEntry[],
  tasks: Task[],
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const s of statuses) grouped[s.label] = [];
  for (const t of tasks) grouped[t.status]?.push(t.id);
  return grouped;
}

export function calculateMidpoint(
  prev: number | null,
  next: number | null,
): number {
  if (prev === null) {
    return next === null ? 0.0 : next / 2.0;
  }
  if (next === null) return prev + 1.0;
  return (prev + next) / 2.0;
}
