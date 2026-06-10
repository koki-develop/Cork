import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { getWorkspaceFilters, setWorkspaceFilters } from "@/api";
import type { StoredFilter, TagFilter } from "@/types";

const toStored = (f: TagFilter): StoredFilter =>
  "tags" in f ? { operator: f.operator, tags: f.tags } : { operator: f.operator };

export function useFilterStore(workspaceDir: string | null): {
  filters: TagFilter[];
  setFilters: (next: TagFilter[]) => void;
} {
  const [filters, setFiltersState] = useState<TagFilter[]>([]);

  useEffect(() => {
    if (workspaceDir === null) {
      setFiltersState([]);
      return;
    }

    let cancelled = false;
    getWorkspaceFilters().then(
      (stored) => {
        if (cancelled) return;
        setFiltersState(
          stored.map((s) =>
            "tags" in s
              ? { id: crypto.randomUUID(), operator: s.operator, tags: s.tags }
              : { id: crypto.randomUUID(), operator: s.operator },
          ),
        );
      },
      (err) => {
        if (cancelled) return;
        toast.error(`Failed to load filters: ${err}`);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [workspaceDir]);

  const setFilters = useCallback(
    (next: TagFilter[]) => {
      setFiltersState(next);
      if (workspaceDir === null) return;
      setWorkspaceFilters(next.map(toStored)).catch((err) => {
        toast.error(`Failed to save filters: ${err}`);
      });
    },
    [workspaceDir],
  );

  return { filters, setFilters };
}
