import { move } from "@dnd-kit/helpers";
import type { DragEndEvent, DragOverEvent } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { useState } from "react";

import {
  calculateMidpoint,
  groupTasksByStatus,
  moveTaskToIndex,
  UNKNOWN_STATUS,
} from "@/lib/board";
import type { StatusEntry, Task } from "@/types";

/**
 * Index at which a card should be inserted when it is dragged over a column's
 * empty area rather than over another card: the number of that column's cards
 * whose vertical center is above the pointer. This is content-aware (it uses
 * each card's real position), unlike dnd-kit's `move()` which only compares the
 * pointer against the full-height lane's center.
 */
function columnDropIndex(
  operation: DragOverEvent["operation"],
  targetColumn: string,
  taskId: string,
): number {
  const droppables = operation.source?.manager?.registry.droppables;
  if (!droppables) return 0;

  const pointerY = operation.shape?.current.center.y ?? operation.position.current.y;

  let index = 0;
  for (const droppable of droppables) {
    if (droppable.type !== "card") continue;
    if (!isSortable(droppable) || droppable.group !== targetColumn) continue;
    if (droppable.id === taskId) continue;
    const center = droppable.shape?.center;
    if (center && center.y < pointerY) index++;
  }
  return index;
}

type Params = {
  statuses: StatusEntry[];
  tasks: Task[];
  onReorderStatuses: (statuses: StatusEntry[]) => Promise<void>;
  onMoveTask: (taskId: string, status: string, order: number) => Promise<void>;
  onRenumberTasks: (paths: string[]) => Promise<void>;
};

export function useBoardDragState({
  statuses,
  tasks,
  onReorderStatuses,
  onMoveTask,
  onRenumberTasks,
}: Params) {
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const derivedColumnOrder = [UNKNOWN_STATUS, ...statuses.map((s) => s.label)];
  const derivedTasksByColumn = groupTasksByStatus(statuses, tasks);

  const [columnOrder, setColumnOrder] = useState(derivedColumnOrder);
  const [tasksByColumn, setTasksByColumn] = useState(derivedTasksByColumn);
  const [snapshot, setSnapshot] = useState({ statuses, tasks });

  if (snapshot.statuses !== statuses || snapshot.tasks !== tasks) {
    setSnapshot({ statuses, tasks });
    setColumnOrder(derivedColumnOrder);
    setTasksByColumn(derivedTasksByColumn);
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { source, target } = event.operation;
    if (!source) return;
    if (source.type === "column") {
      setColumnOrder((prev) => move(prev, event));
    } else if (source.type === "card") {
      // Dropping over a column (its empty area) instead of over a card: place
      // the card at the index computed from the real card positions, since
      // `move()` would derive it from the full-height lane's center instead.
      if (target?.type === "column") {
        const taskId = String(source.id);
        const targetColumn = String(target.id);
        const index = columnDropIndex(event.operation, targetColumn, taskId);
        setTasksByColumn((prev) => moveTaskToIndex(prev, taskId, targetColumn, index));
      } else {
        setTasksByColumn((prev) => move(prev, event));
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (event.canceled) return;
    const { source } = event.operation;
    if (!source) return;

    if (source.type === "column") {
      const statusByLabel = new Map(statuses.map((s) => [s.label, s]));
      const reorderedLabels = columnOrder.filter((label) => statusByLabel.has(label));
      const reordered = reorderedLabels
        .map((label) => statusByLabel.get(label))
        .filter((s): s is StatusEntry => s != null);
      await onReorderStatuses(reordered);
      setColumnOrder([UNKNOWN_STATUS, ...reorderedLabels]);
      return;
    }

    if (source.type === "card") {
      const taskId = String(source.id);
      const newStatus = Object.entries(tasksByColumn).find(([, ids]) => ids.includes(taskId))?.[0];
      const task = tasksById.get(taskId);

      const targetColumn = newStatus ?? task?.status;
      if (!targetColumn) return;

      if (newStatus === UNKNOWN_STATUS) {
        setTasksByColumn(groupTasksByStatus(statuses, tasks));
        return;
      }

      const columnIds = tasksByColumn[targetColumn];
      const idx = columnIds.indexOf(taskId);
      const prevTask = idx > 0 ? tasksById.get(columnIds[idx - 1]) : null;
      const nextTask = idx < columnIds.length - 1 ? tasksById.get(columnIds[idx + 1]) : null;

      let newOrder = calculateMidpoint(prevTask?.order ?? null, nextTask?.order ?? null);

      if (
        prevTask?.order === null ||
        nextTask?.order === null ||
        newOrder === prevTask?.order ||
        newOrder === nextTask?.order
      ) {
        await onRenumberTasks(columnIds);
        newOrder = idx;
      }

      await onMoveTask(taskId, targetColumn, newOrder);
    }
  };

  return {
    columnOrder,
    tasksByColumn,
    tasksById,
    handleDragOver,
    handleDragEnd,
  };
}
