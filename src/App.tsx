import Board from "./components/board/Board";
import DirectoryPicker from "./components/directory/DirectoryPicker";
import { useWorkspace } from "./hooks/useWorkspace";

function App() {
  const {
    dir,
    tasks,
    statuses,
    loadStatuses,
    setDir,
    updateTaskStatus,
    updateTaskOrder,
    renumberTasks,
    reorderStatuses,
  } = useWorkspace();

  if (!dir) {
    return <DirectoryPicker onDirectorySelected={setDir} />;
  }

  return (
    <Board
      tasks={tasks}
      statuses={statuses}
      onStatusesChange={loadStatuses}
      currentDir={dir}
      onDirectoryChange={setDir}
      onTaskStatusUpdate={updateTaskStatus}
      onTaskOrderUpdate={updateTaskOrder}
      onRenumberTasks={renumberTasks}
      onReorderStatuses={reorderStatuses}
    />
  );
}

export default App;
