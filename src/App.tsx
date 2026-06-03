import Board from "./components/board/Board";
import DirectoryPicker from "./components/directory/DirectoryPicker";
import { useWorkspace } from "./hooks/useWorkspace";

function App() {
  const {
    dir,
    tasks,
    statuses,
    loadTasks,
    loadStatuses,
    setDir,
    updateTaskStatus,
  } = useWorkspace();

  if (!dir) {
    return <DirectoryPicker onDirectorySelected={setDir} />;
  }

  return (
    <Board
      tasks={tasks}
      statuses={statuses}
      onStatusChange={loadTasks}
      onStatusesChange={loadStatuses}
      currentDir={dir}
      onDirectoryChange={setDir}
      onTaskStatusUpdate={updateTaskStatus}
    />
  );
}

export default App;
