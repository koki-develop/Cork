import { Toaster } from "sonner";
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

  const page = !dir ? (
    <WelcomePage onDirectorySelected={setDir} />
  ) : (
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

  return (
    <>
      {page}
      <Toaster
        theme="dark"
        position="bottom-right"
        duration={4000}
        toastOptions={{
          style: {
            background: "var(--color-cork-surface)",
            border: "1px solid var(--color-cork-border)",
            color: "var(--color-cork-text)",
            fontSize: "14px",
          },
        }}
      />
    </>
  );
}

export default App;
