import { Droppable } from "@hello-pangea/dnd";
import type { StatusEntry, Task } from "../../types";
import Card from "./Card";

type Props = {
  title: string;
  tasks: Task[];
  color: string;
  statuses: StatusEntry[];
  onStatusChange: () => void;
};

function Column({ title, tasks, color, statuses, onStatusChange }: Props) {
  return (
    <div className="flex w-80 shrink-0 flex-col gap-3">
      <h2
        className={`rounded-lg px-3 py-2 text-lg font-bold text-white ${color}`}
      >
        {title} ({tasks.length})
      </h2>
      <Droppable droppableId={title}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex flex-col gap-2 min-h-2"
          >
            {tasks.map((task, index) => (
              <Card
                key={task.id}
                task={task}
                index={index}
                statuses={statuses}
                onStatusChange={onStatusChange}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

export default Column;
