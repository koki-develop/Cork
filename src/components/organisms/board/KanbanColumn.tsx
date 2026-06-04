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
};

export function KanbanColumn({
  label,
  index,
  taskIds,
  tasksById,
  onCreateTask,
}: KanbanColumnProps) {
  const { ref, handleRef } = useSortable({
    id: label,
    index,
    type: "column",
    accept: ["column", "card"],
    collisionPriority: CollisionPriority.Low,
  });

  const { source, target } = useDragOperation();
  const isCardDropTarget =
    source?.type === "card" &&
    target != null &&
    (target.id === label || (isSortable(target) && target.group === label));

  return (
    <div
      ref={ref}
      className="flex w-72 shrink-0 flex-col rounded-xl border border-cork-border/40 bg-cork-surface/60 min-h-0 max-h-full"
    >
      <div className="flex items-center gap-2 border-b border-cork-border/40 px-4 py-3">
        <DragHandle
          handleRef={handleRef as Ref<HTMLButtonElement>}
          aria-label={`Drag to reorder column ${label}`}
        />
        <Heading level={2} variant="section" className="truncate min-w-0">
          {label}
        </Heading>
        <Badge className="ml-auto">{taskIds.length}</Badge>
      </div>
      <div
        className={clsx(
          "flex flex-1 flex-col min-h-0 p-3 gap-2 transition-colors duration-200",
          isCardDropTarget &&
            "bg-cork-accent/[0.06] ring-1 ring-inset ring-cork-accent/30",
        )}
      >
        <Button
          variant="dashed"
          size="sm"
          onClick={() => onCreateTask(label)}
          className="w-full shrink-0"
        >
          <Plus className="size-3.5" />
          New Task
        </Button>
        <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-24">
          {taskIds.map((id, i) => {
            const task = tasksById.get(id);
            if (!task) return null;
            return <KanbanCard key={id} task={task} group={label} index={i} />;
          })}
        </div>
      </div>
    </div>
  );
}
