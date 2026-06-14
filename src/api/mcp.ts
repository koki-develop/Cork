import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { McpSettings, McpSetupSnippet, McpStatus } from "@/types";

export const getMcpSettings = () => invoke<McpSettings>("get_settings");

export const updateMcpSettings = (settings: McpSettings) =>
  invoke<McpStatus>("update_settings", { settings });

export const generateMcpToken = () => invoke<string>("generate_token");

export const getMcpSampleConfig = () => invoke<string>("get_sample_config");

export const getMcpSetupSnippets = () => invoke<McpSetupSnippet[]>("get_setup_snippets");

export const getMcpServerStatus = () => invoke<McpStatus>("get_server_status");

const SETTINGS_FILE = "settings.json";
const MCP_STORE_KEY = "mcp";

// Wire shape from tauri-plugin-store's `store://change` broadcast. `path` is
// the absolute file the Rust side renders via `Path::serialize`, so we match
// by basename rather than the full path.
type StoreChangePayload = {
  path: string;
  resourceId: number | null;
  key: string;
  value: unknown;
  exists: boolean;
};

/**
 * Subscribe to backend writes to the `mcp` key of `settings.json`. The
 * `tauri-plugin-store` Rust side broadcasts a `store://change` event whenever
 * `store.set()` runs, including writes initiated by other windows — so this
 * is the cross-window sync primitive that replaces 2 s polling.
 */
export const onMcpSettingsChange = (callback: () => void): Promise<UnlistenFn> =>
  listen<StoreChangePayload>("store://change", (event) => {
    if (event.payload.key !== MCP_STORE_KEY) return;
    const basename = event.payload.path.split(/[/\\]/).pop();
    if (basename !== SETTINGS_FILE) return;
    callback();
  });
