import { invoke } from "@tauri-apps/api/core";

export const getWorkspaceName = () => invoke<string | null>("get_workspace_name");

export const setWorkspaceName = (name: string) => invoke<void>("set_workspace_name", { name });
