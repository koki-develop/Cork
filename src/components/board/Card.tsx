import { Draggable } from "@hello-pangea/dnd";
import { GripHorizontal } from "lucide-react";
import { memo } from "react";
import type { Task } from "../../types";

type Props = {
  task: Task;
  index: number;
};

function Card({ task, index }: Props) {
  const bodyPreview = task.body
    .split("\n")
    .slice(0, 3)
    .filter((l) => l.trim())
    .join("\n");

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className="group cursor-pointer rounded-xl border border-cork-border/30 bg-cork-elevated/80 p-3.5 transition-all duration-200 hover:border-cork-border hover:bg-cork-elevated"
        >
          <div className="flex items-start gap-2">
            <GripHorizontal className="mt-0.5 size-3.5 shrink-0 text-cork-muted opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium leading-snug text-cork-text">
                {task.title}
              </h3>
              {bodyPreview && (
                <p className="mt-1.5 text-xs leading-relaxed text-cork-muted line-clamp-2">
                  {bodyPreview}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}

const MemoizedCard = memo(Card);

export default MemoizedCard;
