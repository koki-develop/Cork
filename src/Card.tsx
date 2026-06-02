import { invoke } from "@tauri-apps/api/core";
import type { Task } from "./types";

type Props = {
  task: Task;
  onStatusChange: () => void;
};

const STATUSES: Task["status"][] = ["todo", "doing", "done"];

function statusLabel(status: Task["status"]): string {
  switch (status) {
    case "todo":
      return "Todo";
    case "doing":
      return "Doing";
    case "done":
      return "Done";
  }
}

function Card({ task, onStatusChange }: Props) {
  async function handleStatusClick(nextStatus: Task["status"]) {
    if (nextStatus === task.status) return;
    await invoke("update_task_status", { path: task.id, status: nextStatus });
    onStatusChange();
  }

  const bodyPreview = task.body
    .split("\n")
    .slice(0, 3)
    .filter((l) => l.trim())
    .join("\n");

  return (
    <div className="rounded-lg bg-gray-700 p-3 shadow">
      <h3 className="font-semibold text-white mb-1">{task.title}</h3>
      {bodyPreview && (
        <pre className="text-sm text-gray-400 whitespace-pre-wrap line-clamp-3">
          {bodyPreview}
        </pre>
      )}
      <div className="mt-2 flex gap-1">
        {STATUSES.filter((s) => s !== task.status).map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => handleStatusClick(s)}
            className="text-xs rounded bg-gray-600 px-2 py-0.5 text-gray-300 hover:bg-gray-500 transition-colors"
          >
            Move to {statusLabel(s)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default Card;
