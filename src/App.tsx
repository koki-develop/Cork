import { AnimatePresence, domAnimation, LazyMotion, MotionConfig, m } from "motion/react";
import { Toaster } from "sonner";

import { BoardPage, WelcomePage } from "@/components/pages";
import { useWorkspace } from "@/hooks/useWorkspace";

function App() {
  const {
    dir,
    tasks,
    statuses,
    query,
    filters,
    availableTags,
    loadTasks,
    loadStatuses,
    setDir,
    createTask,
    updateTask,
    deleteTask,
    updateTaskStatus,
    updateTaskOrder,
    renumberTasks,
    reorderStatuses,
    handleQueryChange,
    handleFiltersChange,
  } = useWorkspace();

  const pageKey = dir ? "board" : "welcome";
  const page = !dir ? (
    <WelcomePage onDirectorySelected={setDir} />
  ) : (
    <BoardPage
      dir={dir}
      tasks={tasks}
      statuses={statuses}
      searchQuery={query}
      filters={filters}
      availableTags={availableTags}
      loadTasks={loadTasks}
      loadStatuses={loadStatuses}
      setDir={setDir}
      onSearchChange={handleQueryChange}
      onFiltersChange={handleFiltersChange}
      createTask={createTask}
      updateTask={updateTask}
      deleteTask={deleteTask}
      updateTaskStatus={updateTaskStatus}
      updateTaskOrder={updateTaskOrder}
      renumberTasks={renumberTasks}
      reorderStatuses={reorderStatuses}
    />
  );

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <AnimatePresence mode="wait">
          <m.div
            key={pageKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {page}
          </m.div>
        </AnimatePresence>
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
      </MotionConfig>
    </LazyMotion>
  );
}

export default App;
