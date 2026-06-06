import { useSortable } from "@dnd-kit/react/sortable";
import { clsx } from "clsx";

import { Heading, Text } from "@/components/atoms";
import { TagList } from "@/components/molecules";
import type { Task } from "@/types";

export type KanbanCardProps = {
  task: Task;
  group: string;
  index: number;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

export function KanbanCard({ task, group, index, onClick, onContextMenu }: KanbanCardProps) {
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
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions: clickable+draggable card needs a div for dnd-kit sortable ref
    <div
      ref={ref}
      onClick={onClick}
      onContextMenu={onContextMenu}
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
        "border-cork-border/30 bg-cork-elevated/80 hover:border-cork-border hover:bg-cork-elevated rounded-xl border p-3.5 select-none",
        onClick && "cursor-pointer",
        !onClick && "cursor-grab active:cursor-grabbing",
        isDragging && "ring-cork-accent/30 opacity-50 ring-2",
      )}
    >
      <Heading level={3} variant="card" className="line-clamp-2">
        {task.title}
      </Heading>
      <TagList tags={task.tags} className="mt-2" />
      {bodyPreview && (
        <Text as="p" variant="muted" size="xs" className="mt-1.5 line-clamp-2 leading-relaxed">
          {bodyPreview}
        </Text>
      )}
    </div>
  );
}
