import { useDroppable } from "@dnd-kit/react";
import { GripVertical } from "lucide-react";
import type { Task } from "../../types";
import Card from "./Card";

type Props = {
  title: string;
  tasks: Task[];
};

function Column({ title, tasks }: Props) {
  const { ref, isDropTarget } = useDroppable({
    id: title,
    accept: "card",
  });

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border border-cork-border/40 bg-cork-surface/60">
      <div className="flex items-center gap-2 border-b border-cork-border/40 px-4 py-3">
        <GripVertical className="size-3.5 text-cork-muted shrink-0" />
        <h2 className="text-sm font-semibold text-cork-text">{title}</h2>
        <span className="ml-auto flex size-5 items-center justify-center rounded-md bg-cork-elevated text-xs font-medium text-cork-muted">
          {tasks.length}
        </span>
      </div>
      <div
        ref={ref}
        className={`flex flex-col gap-2 p-3 min-h-24 flex-1 transition-colors duration-200 ${isDropTarget ? "bg-cork-accent/[0.06] ring-1 ring-inset ring-cork-accent/30" : ""}`}
      >
        {tasks.map((task) => (
          <Card key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

export default Column;
