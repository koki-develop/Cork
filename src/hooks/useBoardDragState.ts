import { move } from "@dnd-kit/helpers";
import type { DragEndEvent, DragOverEvent } from "@dnd-kit/react";
import { useState } from "react";

import { calculateMidpoint, groupTasksByStatus, UNKNOWN_STATUS } from "@/lib/board";
import type { StatusEntry, Task } from "@/types";

type Params = {
  statuses: StatusEntry[];
  tasks: Task[];
  onReorderStatuses: (statuses: StatusEntry[]) => Promise<void>;
  onTaskStatusUpdate: (taskId: string, newStatus: string) => Promise<void>;
  onTaskOrderUpdate: (taskId: string, order: number) => Promise<void>;
  onRenumberTasks: (paths: string[]) => Promise<void>;
};

export function useBoardDragState({
  statuses,
  tasks,
  onReorderStatuses,
  onTaskStatusUpdate,
  onTaskOrderUpdate,
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
    const { source } = event.operation;
    if (!source) return;
    if (source.type === "column") {
      setColumnOrder((prev) => move(prev, event));
    } else if (source.type === "card") {
      setTasksByColumn((prev) => move(prev, event));
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

      await onTaskOrderUpdate(taskId, newOrder);

      if (newStatus && task && task.status !== newStatus) {
        await onTaskStatusUpdate(taskId, newStatus);
      }
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
