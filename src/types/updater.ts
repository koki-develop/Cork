import type { Update } from "@tauri-apps/plugin-updater";

// The visible UI states for the in-app updater. `useUpdater` owns the state
// machine transitions; the matching `UpdaterToast` organism reads this type
// via `@/types` to stay decoupled from the hook layer (the oxlint rule in
// `.oxlintrc.json` forbids organisms from importing `@/hooks/**`).
export type UpdaterState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; update: Update; version: string }
  | { kind: "downloading"; version: string; downloaded: number; contentLength: number | null }
  | { kind: "installing"; version: string }
  | { kind: "error"; message: string; version: string | null };
