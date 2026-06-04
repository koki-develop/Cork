import { useSortable } from "@dnd-kit/react/sortable";
import { clsx } from "clsx";
import { Heading, Text } from "@/components/atoms";
import type { Task } from "@/types";

export type KanbanCardProps = {
  task: Task;
  group: string;
  index: number;
};

export function KanbanCard({ task, group, index }: KanbanCardProps) {
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
      className={clsx(
        "cursor-grab active:cursor-grabbing rounded-xl border border-cork-border/30 bg-cork-elevated/80 p-3.5 transition-all duration-200 hover:border-cork-border hover:bg-cork-elevated",
        isDragging && "opacity-50 ring-2 ring-cork-accent/30",
      )}
    >
      <Heading level={3} variant="card" className="truncate">
        {task.title}
      </Heading>
      {bodyPreview && (
        <Text
          as="p"
          variant="muted"
          size="xs"
          className="mt-1.5 leading-relaxed line-clamp-2"
        >
          {bodyPreview}
        </Text>
      )}
    </div>
  );
}
