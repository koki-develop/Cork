import { invoke } from "@tauri-apps/api/core";

import type { StoredFilter } from "@/types";

export const pickDirectory = () => invoke<string | null>("pick_directory");

export const setWorkspaceDirectory = (path: string) =>
  invoke<void>("set_workspace_directory", { path });

export const getWorkspaceDirectory = () => invoke<string | null>("get_workspace_directory");

export const getWorkspaceFilters = () => invoke<StoredFilter[]>("get_workspace_filters");

export const setWorkspaceFilters = (filters: StoredFilter[]) =>
  invoke<void>("set_workspace_filters", { filters });
