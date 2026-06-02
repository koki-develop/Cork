import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";

type Props = {
  isOpen: boolean;
  currentDir: string;
  onClose: () => void;
  onDirectoryChange: (path: string) => void;
};

function SettingsPanel({
  isOpen,
  currentDir,
  onClose,
  onDirectoryChange,
}: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleChangeDirectory() {
    const path = await invoke<string | null>("select_directory");
    if (path) {
      onDirectoryChange(path);
      onClose();
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
        aria-label="Close settings"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div
          className="w-96 rounded-lg bg-gray-800 p-6 text-white shadow-xl pointer-events-auto"
          role="dialog"
          aria-modal="true"
        >
          <h2 className="mb-4 text-xl font-bold">Settings</h2>

          <div className="mb-4">
            <span className="mb-1 block text-sm text-gray-400">
              Workspace Directory
            </span>
            <p className="truncate rounded bg-gray-700 px-3 py-2 text-sm font-mono">
              {currentDir}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleChangeDirectory}
              className="rounded bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-500 transition-colors"
            >
              Change Directory
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-gray-600 px-4 py-2 font-semibold hover:bg-gray-500 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
