import { BoardPage, WelcomePage } from "@/components/pages";
import { useWorkspace } from "@/hooks/useWorkspace";

function App() {
  const {
    dir,
    tasks,
    statuses,
    loadTasks,
    loadStatuses,
    setDir,
    createTask,
    updateTaskStatus,
    updateTaskOrder,
    renumberTasks,
    reorderStatuses,
  } = useWorkspace();

  if (!dir) {
    return <WelcomePage onDirectorySelected={setDir} />;
  }

  return (
    <BoardPage
      dir={dir}
      tasks={tasks}
      statuses={statuses}
      loadTasks={loadTasks}
      loadStatuses={loadStatuses}
      setDir={setDir}
      createTask={createTask}
      updateTaskStatus={updateTaskStatus}
      updateTaskOrder={updateTaskOrder}
      renumberTasks={renumberTasks}
      reorderStatuses={reorderStatuses}
    />
  );
}

export default App;
