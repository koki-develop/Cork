import Column from "./Column";
import type { Task } from "./types";

type Props = {
  tasks: Task[];
  onStatusChange: () => void;
};

const COLUMNS: { status: Task["status"]; title: string; color: string }[] = [
  { status: "todo", title: "Todo", color: "bg-gray-600" },
  { status: "doing", title: "Doing", color: "bg-blue-600" },
  { status: "done", title: "Done", color: "bg-green-600" },
];

function Board({ tasks, onStatusChange }: Props) {
  return (
    <div className="flex min-h-screen gap-4 overflow-x-auto bg-gray-900 p-6">
      {COLUMNS.map((col) => (
        <Column
          key={col.status}
          title={col.title}
          tasks={tasks.filter((t) => t.status === col.status)}
          color={col.color}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  );
}

export default Board;
