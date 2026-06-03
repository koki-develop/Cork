import { move } from "@dnd-kit/helpers";
import type { DragEndEvent, DragOverEvent } from "@dnd-kit/react";
import { useState } from "react";
import type { StatusEntry, Task } from "../types";

type Params = {
  statuses: StatusEntry[];
  tasks: Task[];
  onReorderStatuses: (statuses: StatusEntry[]) => Promise<void>;
  onTaskStatusUpdate: (taskId: string, newStatus: string) => Promise<void>;
};

function groupTasksByStatus(
  statuses: StatusEntry[],
  tasks: Task[],
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const s of statuses) grouped[s.label] = [];
  for (const t of tasks) grouped[t.status]?.push(t.id);
  return grouped;
}

export function useBoardDragState({
  statuses,
  tasks,
  onReorderStatuses,
  onTaskStatusUpdate,
}: Params) {
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const derivedColumnOrder = statuses.map((s) => s.label);
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
      const reordered = columnOrder
        .map((label) => statusByLabel.get(label))
        .filter((s): s is StatusEntry => s != null);
      await onReorderStatuses(reordered);
      return;
    }

    if (source.type === "card") {
      const taskId = String(source.id);
      const newStatus = Object.entries(tasksByColumn).find(([, ids]) =>
        ids.includes(taskId),
      )?.[0];
      const task = tasksById.get(taskId);
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
