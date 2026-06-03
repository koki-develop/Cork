import { invoke } from "@tauri-apps/api/core";

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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-900 text-white">
      <h1 className="text-3xl font-bold">Cork</h1>
      <p className="text-gray-400">Select a workspace directory to start</p>
      <button
        type="button"
        onClick={handleSelect}
        className="rounded bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500 transition-colors"
      >
        Select Directory
      </button>
    </main>
  );
}

export default DirectoryPicker;
