import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getWorkspaceFilters, setWorkspaceFilters } from "@/api";
import type { StoredFilter, TagFilter } from "@/types";

const toStored = (f: TagFilter): StoredFilter =>
  "tags" in f
    ? { operator: f.operator, tags: f.tags }
    : { operator: f.operator };

const SAVE_DEBOUNCE_MS = 500;

export function useFilterStore(workspaceDir: string | null): {
  filters: TagFilter[];
  scheduleSave: (filters: TagFilter[]) => void;
} {
  const [filters, setFilters] = useState<TagFilter[]>([]);
  const saveTimerRef = useRef<number | null>(null);
  const workspaceDirRef = useRef(workspaceDir);
  workspaceDirRef.current = workspaceDir;

  const cancelPendingSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      globalThis.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    cancelPendingSave();
    if (workspaceDir === null) {
      setFilters([]);
      return;
    }

    let cancelled = false;
    getWorkspaceFilters().then(
      (stored) => {
        if (cancelled) return;
        setFilters(
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
  }, [workspaceDir, cancelPendingSave]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        globalThis.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const scheduleSave = useCallback((filters: TagFilter[]) => {
    if (workspaceDirRef.current === null) return;
    if (saveTimerRef.current !== null) {
      globalThis.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = globalThis.setTimeout(() => {
      saveTimerRef.current = null;
      setWorkspaceFilters(filters.map(toStored)).catch((err) => {
        toast.error(`Failed to save filters: ${err}`);
      });
    }, SAVE_DEBOUNCE_MS) as unknown as number;
  }, []);

  return { filters, scheduleSave };
}
