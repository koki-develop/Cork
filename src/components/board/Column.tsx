import { Droppable } from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";
import type { Task } from "../../types";
import Card from "./Card";

type Props = {
  title: string;
  tasks: Task[];
};

function Column({ title, tasks }: Props) {
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border border-cork-border/40 bg-cork-surface/60">
      <div className="flex items-center gap-2 border-b border-cork-border/40 px-4 py-3">
        <GripVertical className="size-3.5 text-cork-muted shrink-0" />
        <h2 className="text-sm font-semibold text-cork-text">{title}</h2>
        <span className="ml-auto flex size-5 items-center justify-center rounded-md bg-cork-elevated text-xs font-medium text-cork-muted">
          {tasks.length}
        </span>
      </div>
      <Droppable droppableId={title}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex flex-col gap-2 p-3 min-h-24 flex-1"
          >
            {tasks.map((task, index) => (
              <Card key={task.id} task={task} index={index} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

export default Column;
