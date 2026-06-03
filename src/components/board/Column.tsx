import { CollisionPriority } from "@dnd-kit/abstract";
import { useDragOperation } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical } from "lucide-react";
import type { Task } from "../../types";
import Card from "./Card";

type Props = {
  label: string;
  index: number;
  taskIds: string[];
  tasksById: Map<string, Task>;
};

function Column({ label, index, taskIds, tasksById }: Props) {
  const { ref, handleRef, isDropTarget } = useSortable({
    id: label,
    index,
    type: "column",
    accept: ["column", "card"],
    collisionPriority: CollisionPriority.Low,
  });

  const { source } = useDragOperation();
  const isCardDropTarget = isDropTarget && source?.type === "card";

  return (
    <div
      ref={ref}
      className="flex w-72 shrink-0 flex-col rounded-xl border border-cork-border/40 bg-cork-surface/60"
    >
      <div className="flex items-center gap-2 border-b border-cork-border/40 px-4 py-3">
        <GripVertical
          ref={handleRef}
          className="size-3.5 text-cork-muted shrink-0 cursor-grab active:cursor-grabbing"
        />
        <h2 className="text-sm font-semibold text-cork-text">{label}</h2>
        <span className="ml-auto flex size-5 items-center justify-center rounded-md bg-cork-elevated text-xs font-medium text-cork-muted">
          {taskIds.length}
        </span>
      </div>
      <div
        className={`flex flex-col gap-2 p-3 min-h-24 flex-1 transition-colors duration-200 ${isCardDropTarget ? "bg-cork-accent/[0.06] ring-1 ring-inset ring-cork-accent/30" : ""}`}
      >
        {taskIds.map((id, i) => {
          const task = tasksById.get(id);
          if (!task) return null;
          return <Card key={id} task={task} group={label} index={i} />;
        })}
      </div>
    </div>
  );
}

export default Column;
