import { useState } from "react";

import { reconcileExternalStatusChanges } from "@/api";
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
    // External .md edits go through reconciliation first: if the user
    // flipped `status:` in the file directly, the carried-over `order` would
    // land the task somewhere mid-column. Reconciliation detects that
    // status-only change and bumps the order to the top of the new column
    // (and refreshes the backend cache so loadTasks/loadAvailableTags see
    // the post-repair state). On reconciliation failure we still refresh,
    // so a transient disk error degrades to "task appears mid-column" — the
    // user can drag it where they want — rather than a stale UI.
    onMdChange: async () => {
      try {
        await reconcileExternalStatusChanges();
      } catch (e) {
        console.error("Failed to reconcile external status changes", e);
      }
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
