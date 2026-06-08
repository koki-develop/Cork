import { useCallback, useEffect, useState } from "react";

import { getStatuses, saveStatuses } from "@/api";
import type { StatusEntry } from "@/types";

const DEFAULT_STATUSES: StatusEntry[] = [{ label: "Todo" }, { label: "Doing" }, { label: "Done" }];

export function useWorkspaceStatuses(dir: string | null) {
  const [statuses, setStatuses] = useState<StatusEntry[]>(DEFAULT_STATUSES);

  const loadStatuses = useCallback(async () => {
    const result = await getStatuses();
    setStatuses(result ?? DEFAULT_STATUSES);
  }, []);

  const reorderStatuses = useCallback(
    async (newStatuses: StatusEntry[]) => {
      await saveStatuses(newStatuses);
      await loadStatuses();
    },
    [loadStatuses],
  );

  useEffect(() => {
    if (!dir) return;
    loadStatuses();
  }, [dir, loadStatuses]);

  return { statuses, loadStatuses, reorderStatuses };
}
