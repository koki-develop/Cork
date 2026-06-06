import type { StatusEntry, Task } from "@/types";

export const UNKNOWN_STATUS = "__unknown__";

// Sort tasks the same way the backend's `list_tasks` does: `order` ascending,
// with `null` treated as +Infinity (matches the Rust `f64::MAX` fallback), and
// title as a stable tie-breaker. Keeping the columns sorted here — instead of
// trusting the input array's order — is what makes an optimistic in-place
// mutation of a task's `order` (e.g. during a drag-end move) reflect in its
// column position immediately, without waiting for the backend re-fetch.
function compareTasks(a: Task, b: Task): number {
  const ao = a.order ?? Number.POSITIVE_INFINITY;
  const bo = b.order ?? Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao - bo;
  return a.title.localeCompare(b.title);
}

export function groupTasksByStatus(
  statuses: StatusEntry[],
  tasks: Task[],
): Record<string, string[]> {
  const definedLabels = new Set(statuses.map((s) => s.label));
  const grouped: Record<string, Task[]> = {};
  for (const s of statuses) grouped[s.label] = [];
  grouped[UNKNOWN_STATUS] = [];
  for (const t of tasks) {
    if (definedLabels.has(t.status)) {
      grouped[t.status]?.push(t);
    } else {
      grouped[UNKNOWN_STATUS]?.push(t);
    }
  }
  const result: Record<string, string[]> = {};
  for (const [column, items] of Object.entries(grouped)) {
    items.sort(compareTasks);
    result[column] = items.map((t) => t.id);
  }
  return result;
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Move a card to an explicit index within a target column, removing it from
 * whichever column currently holds it.
 *
 * Used when a card is dragged over a column's empty area (not over another
 * card). dnd-kit's `move()` helper can't be trusted there: it decides top-vs-
 * bottom by comparing the pointer against the column's vertical center, but our
 * lanes stretch to the full viewport height, so that center sits far below the
 * cards and the helper snaps the card to the top. The caller instead computes
 * the insertion index from the actual card geometry and passes it here.
 *
 * Returns the same reference when nothing changes, to avoid a needless render.
 */
export function moveTaskToIndex(
  tasksByColumn: Record<string, string[]>,
  taskId: string,
  targetColumn: string,
  index: number,
): Record<string, string[]> {
  if (!(targetColumn in tasksByColumn)) return tasksByColumn;

  const withoutTask: Record<string, string[]> = {};
  let sourceColumn: string | undefined;
  for (const [column, ids] of Object.entries(tasksByColumn)) {
    if (ids.includes(taskId)) sourceColumn = column;
    withoutTask[column] = ids.filter((id) => id !== taskId);
  }

  const nextTarget = withoutTask[targetColumn].slice();
  nextTarget.splice(index, 0, taskId);

  if (sourceColumn === targetColumn && sameOrder(nextTarget, tasksByColumn[targetColumn])) {
    return tasksByColumn;
  }

  return { ...withoutTask, [targetColumn]: nextTarget };
}

/**
 * Compute an `order` value that sorts strictly between `prev` and `next`.
 *
 * - Both `null`: column is empty, anchor at 0.
 * - Only `prev`: card goes to the bottom — pick anything greater than `prev`.
 * - Only `next`: card goes to the top — pick anything **less** than `next`.
 *   `next - 1` works for every sign of `next`; the previous `next / 2`
 *   silently inverted for negative `next` (e.g. `-2 / 2 = -1`, which sorts
 *   below `-2`, not above), placing the dragged card on the wrong side.
 *   `createTask` mints fresh cards at `min(orders) - 1`, so most columns
 *   naturally trend toward negative `order`s and the inversion was the
 *   common case.
 * - Both present: midpoint.
 */
export function calculateMidpoint(prev: number | null, next: number | null): number {
  if (prev === null) {
    return next === null ? 0.0 : next - 1.0;
  }
  if (next === null) return prev + 1.0;
  return (prev + next) / 2.0;
}

/**
 * Picks the new `order` slot for a card just dropped at `idx` in `columnIds`,
 * along with whether the column must be renumbered first.
 *
 * Renumber triggers when either neighbor's order is `null` (legacy tasks
 * with no order can't anchor a midpoint) or when the midpoint collides with
 * a neighbor's order (floating-point precision exhausted). In the renumber
 * branch the new order falls back to the integer index so the backend's
 * subsequent re-sort places the card at the same slot.
 */
export function computeDropOrder(
  columnIds: string[],
  idx: number,
  tasksById: Map<string, Task>,
): { order: number; renumber: boolean } {
  const prevTask = idx > 0 ? tasksById.get(columnIds[idx - 1]) : null;
  const nextTask = idx < columnIds.length - 1 ? tasksById.get(columnIds[idx + 1]) : null;
  const midpoint = calculateMidpoint(prevTask?.order ?? null, nextTask?.order ?? null);
  const renumber =
    prevTask?.order === null ||
    nextTask?.order === null ||
    midpoint === prevTask?.order ||
    midpoint === nextTask?.order;
  return { order: renumber ? idx : midpoint, renumber };
}
