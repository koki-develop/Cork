import { useSortable } from "@dnd-kit/react/sortable";
import type { Task } from "../../types";

type Props = {
  task: Task;
  group: string;
  index: number;
};

function Card({ task, group, index }: Props) {
  const { ref, isDragging } = useSortable({
    id: task.id,
    index,
    group,
    type: "card",
    accept: "card",
  });

  const bodyPreview = task.body
    .split("\n")
    .slice(0, 3)
    .filter((l) => l.trim())
    .join("\n");

  return (
    <div
      ref={ref}
      className={`cursor-grab active:cursor-grabbing rounded-xl border border-cork-border/30 bg-cork-elevated/80 p-3.5 transition-all duration-200 hover:border-cork-border hover:bg-cork-elevated ${isDragging ? "opacity-50 ring-2 ring-cork-accent/30" : ""}`}
    >
      <h3 className="text-sm font-medium leading-snug text-cork-text">
        {task.title}
      </h3>
      {bodyPreview && (
        <p className="mt-1.5 text-xs leading-relaxed text-cork-muted line-clamp-2">
          {bodyPreview}
        </p>
      )}
    </div>
  );
}

export default Card;
