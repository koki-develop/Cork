import { useSortable } from "@dnd-kit/react/sortable";
import { clsx } from "clsx";
import { Heading, Text } from "@/components/atoms";
import type { Task } from "@/types";

export type KanbanCardProps = {
  task: Task;
  group: string;
  index: number;
  onClick?: () => void;
};

export function KanbanCard({ task, group, index, onClick }: KanbanCardProps) {
  const { ref, isDragging } = useSortable({
    id: task.id,
    index,
    group,
    type: "card",
    accept: "card",
  });

  const bodyPreview = task.body
    .split("\n")
    .filter((l) => l.trim())
    .slice(0, 2)
    .join("\n");

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: clickable+draggable card needs a div for dnd-kit sortable ref
    <div
      ref={ref}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={clsx(
        "rounded-xl border border-cork-border/30 bg-cork-elevated/80 p-3.5 hover:border-cork-border hover:bg-cork-elevated",
        onClick && "cursor-pointer",
        !onClick && "cursor-grab active:cursor-grabbing",
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
          className="mt-1.5 line-clamp-2 leading-relaxed"
        >
          {bodyPreview}
        </Text>
      )}
    </div>
  );
}
