import { CollisionPriority } from "@dnd-kit/abstract";
import { useDragOperation } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { clsx } from "clsx";
import { Plus } from "lucide-react";
import type { Ref } from "react";
import { Badge, Button, Heading } from "@/components/atoms";
import { DragHandle } from "@/components/molecules";
import type { Task } from "@/types";
import { KanbanCard } from "./KanbanCard";

export type KanbanColumnProps = {
  label: string;
  index: number;
  taskIds: string[];
  tasksById: Map<string, Task>;
  onCreateTask: (status: string) => void;
  onCardClick?: (taskId: string) => void;
  showNewTaskButton?: boolean;
  draggable?: boolean;
  displayLabel?: string;
};

export function KanbanColumn({
  label,
  index,
  taskIds,
  tasksById,
  onCreateTask,
  onCardClick,
  showNewTaskButton = true,
  draggable = true,
  displayLabel,
}: KanbanColumnProps) {
  const { ref, handleRef } = useSortable({
    id: label,
    index,
    type: "column",
    accept: draggable ? ["column", "card"] : [],
    collisionPriority: CollisionPriority.Low,
  });

  const { source, target } = useDragOperation();
  const isCardDropTarget =
    draggable &&
    source?.type === "card" &&
    target != null &&
    (target.id === label || (isSortable(target) && target.group === label));

  return (
    <div
      ref={ref}
      className="flex max-h-full min-h-0 w-72 shrink-0 flex-col rounded-xl border border-cork-border/40 bg-cork-surface/60"
    >
      <div className="flex items-center gap-2 border-cork-border/40 border-b px-4 py-3">
        {draggable && handleRef ? (
          <DragHandle
            handleRef={handleRef as Ref<HTMLButtonElement>}
            aria-label={`Drag to reorder column ${label}`}
          />
        ) : (
          <div className="size-8" />
        )}
        <Heading level={2} variant="section" className="min-w-0 truncate">
          {displayLabel ?? label}
        </Heading>
        <Badge className="ml-auto">{taskIds.length}</Badge>
      </div>
      <div
        className={clsx(
          "flex min-h-0 flex-1 flex-col gap-2 p-3 transition-colors duration-200",
          isCardDropTarget &&
            "bg-cork-accent/[0.06] ring-1 ring-cork-accent/30 ring-inset",
        )}
      >
        {showNewTaskButton && (
          <Button
            variant="dashed"
            size="sm"
            onClick={() => onCreateTask(label)}
            className="w-full shrink-0"
          >
            <Plus className="size-3.5" />
            New Task
          </Button>
        )}
        <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto">
          {taskIds.map((id, i) => {
            const task = tasksById.get(id);
            if (!task) return null;
            return (
              <KanbanCard
                key={id}
                task={task}
                group={label}
                index={i}
                onClick={onCardClick ? () => onCardClick(id) : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
