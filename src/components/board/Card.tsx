import { Draggable } from "@hello-pangea/dnd";
import { invoke } from "@tauri-apps/api/core";
import type { StatusEntry, Task } from "../../types";

type Props = {
  task: Task;
  index: number;
  statuses: StatusEntry[];
  onStatusChange: () => void;
};

function Card({ task, index, statuses, onStatusChange }: Props) {
  async function handleStatusClick(nextStatus: string) {
    if (nextStatus === task.status) return;
    await invoke("update_task_status", { path: task.id, status: nextStatus });
    onStatusChange();
  }

  const bodyPreview = task.body
    .split("\n")
    .slice(0, 3)
    .filter((l) => l.trim())
    .join("\n");

  const otherStatuses = statuses.filter((s) => s.label !== task.status);

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className="rounded-lg bg-gray-700 p-3 shadow"
        >
          <h3 className="font-semibold text-white mb-1">{task.title}</h3>
          {bodyPreview && (
            <pre className="text-sm text-gray-400 whitespace-pre-wrap line-clamp-3">
              {bodyPreview}
            </pre>
          )}
          <div className="mt-2 flex gap-1">
            {otherStatuses.map((s) => (
              <button
                type="button"
                key={s.label}
                onClick={() => handleStatusClick(s.label)}
                className="text-xs rounded bg-gray-600 px-2 py-0.5 text-gray-300 hover:bg-gray-500 transition-colors"
              >
                Move to {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </Draggable>
  );
}

export default Card;
