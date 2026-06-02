import { Settings } from "lucide-react";
import { useState } from "react";
import Column from "./Column";
import SettingsPanel from "./SettingsPanel";
import type { Task } from "./types";

type Props = {
  tasks: Task[];
  onStatusChange: () => void;
  currentDir: string;
  onDirectoryChange: (path: string) => void;
};

const COLUMNS: { status: Task["status"]; title: string; color: string }[] = [
  { status: "todo", title: "Todo", color: "bg-gray-600" },
  { status: "doing", title: "Doing", color: "bg-blue-600" },
  { status: "done", title: "Done", color: "bg-green-600" },
];

function Board({
  tasks,
  onStatusChange,
  currentDir,
  onDirectoryChange,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <div className="relative flex min-h-screen gap-4 overflow-x-auto bg-gray-900 p-6">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="absolute right-4 top-4 rounded p-2 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          aria-label="Settings"
        >
          <Settings className="h-5 w-5" />
        </button>
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
      <SettingsPanel
        isOpen={settingsOpen}
        currentDir={currentDir}
        onClose={() => setSettingsOpen(false)}
        onDirectoryChange={onDirectoryChange}
      />
    </>
  );
}

export default Board;
