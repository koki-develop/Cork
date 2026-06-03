import { invoke } from "@tauri-apps/api/core";
import { FolderOpen } from "lucide-react";
import Button from "../ui/Button";

type Props = {
  onDirectorySelected: (path: string) => void;
};

function DirectoryPicker({ onDirectorySelected }: Props) {
  async function handleSelect() {
    const path = await invoke<string | null>("select_directory");
    if (path) {
      onDirectorySelected(path);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 select-none">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-4xl font-bold tracking-tight">Cork</h1>
        <p className="text-cork-muted text-sm">
          Kanban board for local Markdown files
        </p>
      </div>

      <Button
        variant="primary"
        size="lg"
        onClick={handleSelect}
        className="gap-2 rounded-xl"
      >
        <FolderOpen className="size-4" />
        Select Workspace Directory
      </Button>
    </main>
  );
}

export default DirectoryPicker;
