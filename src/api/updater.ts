import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

// In-app updater wiring. Cork keeps no persisted updater settings of its own
// (auto-check is always on), so this file only re-exports thin wrappers over
// `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process`. The version
// comparison and the bundle replacement both happen entirely inside the
// plugins; we just trigger them and surface the state to the React tree.

export const checkForUpdate = (): Promise<Update | null> => check();

export const downloadAndInstall = (
  update: Update,
  onProgress?: (event: DownloadProgress) => void,
): Promise<void> => update.downloadAndInstall(onProgress);

export const relaunchApp = (): Promise<void> => relaunch();

export type DownloadProgress = Parameters<Update["downloadAndInstall"]>[0] extends
  | ((event: infer E) => void)
  | undefined
  | null
  ? E
  : never;
