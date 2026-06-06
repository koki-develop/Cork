import { useState } from "react";

import { useFilterStore } from "@/hooks/useFilterStore";
import { useWorkspaceStatuses } from "@/hooks/useWorkspaceStatuses";
import { useWorkspaceTasks } from "@/hooks/useWorkspaceTasks";
import { useWorkspaceWatcher } from "@/hooks/useWorkspaceWatcher";

export function useWorkspace(dir: string) {
  const [query, setQuery] = useState("");

  const { filters, setFilters } = useFilterStore(dir);
  const { statuses, loadStatuses, reorderStatuses } = useWorkspaceStatuses(dir);
  const {
    tasks,
    availableTags,
    loadTasks,
    loadAvailableTags,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    renumberTasks,
  } = useWorkspaceTasks({ dir, query, filters });

  useWorkspaceWatcher(dir, {
    onCorkConfigChange: () => {
      loadStatuses();
      loadTasks().then(loadAvailableTags);
    },
    onMdChange: () => {
      loadTasks().then(loadAvailableTags);
    },
  });

  return {
    tasks,
    query,
    statuses,
    filters,
    availableTags,
    setQuery,
    setFilters,
    loadTasks,
    loadStatuses,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    renumberTasks,
    reorderStatuses,
  };
}
