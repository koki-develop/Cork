import { invoke } from "@tauri-apps/api/core";
import type { StatusEntry } from "@/types";

export const getStatuses = () => invoke<StatusEntry[]>("get_statuses");

export const saveStatuses = (
  statuses: StatusEntry[],
  renameMap?: Record<string, string>,
) => invoke<void>("save_statuses", { statuses, renameMap });
