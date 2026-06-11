import { openUrl as pluginOpenUrl } from "@tauri-apps/plugin-opener";

/** Opens a URL in the system's default browser (not the app webview). */
export function openUrl(url: string): Promise<void> {
  return pluginOpenUrl(url);
}
