import { Settings } from "lucide-react";
import { useCallback, useState } from "react";
import Column from "./Column";
import SettingsPanel from "./SettingsPanel";
import type { StatusEntry, Task } from "./types";

const STATUS_COLORS = [
  "bg-gray-600",
  "bg-blue-600",
  "bg-green-600",
  "bg-yellow-600",
  "bg-purple-600",
  "bg-pink-600",
  "bg-indigo-600",
  "bg-red-600",
  "bg-teal-600",
];

type Props = {
  tasks: Task[];
  statuses: StatusEntry[];
  onStatusChange: () => void;
  onStatusesChange: () => void;
  currentDir: string;
  onDirectoryChange: (path: string) => void;
};

function Board({
  tasks,
  statuses,
  onStatusChange,
  onStatusesChange,
  currentDir,
  onDirectoryChange,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const handleClose = useCallback(() => setSettingsOpen(false), []);

  return (
    <>
      <div className="relative flex min-h-screen gap-4 overflow-x-auto bg-gray-900 p-6">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="absolute right-4 top-4 rounded p-2 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          aria-label="Settings"
        >
          <Settings className="size-5" />
        </button>
        {statuses.map((s, i) => (
          <Column
            key={s.label}
            title={s.label}
            tasks={tasks.filter((t) => t.status === s.label)}
            color={STATUS_COLORS[i % STATUS_COLORS.length]}
            statuses={statuses}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>
      <SettingsPanel
        key={String(settingsOpen)}
        isOpen={settingsOpen}
        statuses={statuses}
        currentDir={currentDir}
        onClose={handleClose}
        onDirectoryChange={onDirectoryChange}
        onStatusesChange={onStatusesChange}
      />
    </>
  );
}

export default Board;
