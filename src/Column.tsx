import Card from "./Card";
import type { Task } from "./types";

type Props = {
  title: string;
  tasks: Task[];
  color: string;
  onStatusChange: () => void;
};

function Column({ title, tasks, color, onStatusChange }: Props) {
  return (
    <div className="flex w-80 shrink-0 flex-col gap-3">
      <h2
        className={`rounded-lg px-3 py-2 text-lg font-bold text-white ${color}`}
      >
        {title} ({tasks.length})
      </h2>
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <Card key={task.id} task={task} onStatusChange={onStatusChange} />
        ))}
      </div>
    </div>
  );
}

export default Column;
