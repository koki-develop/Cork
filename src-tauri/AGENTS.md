# Rust backend (`src-tauri/`)

## Layout

`main.rs` is the entry point and calls `cork_lib::run()`. All `#[tauri::command]` definitions and shared state live in `lib.rs`.

## State

`AppState { Mutex<Option<String>> }` holds the currently selected workspace directory path. Read it from inside a command handler; do not assume a directory is set.

## Security model

Frontend write commands take a `path` argument. They **must** call `fs::canonicalize` on the path and reject it if the canonical path does not live inside the workspace directory (return `"Access denied"`). Any new write command must follow this pattern — without it, the frontend could escape the workspace via symlinks or `..` segments.

## Workspace registration

`set_workspace_directory` saves the path to `AppState` + `tauri_plugin_store` **and** registers it with `fs_scope()` via `FsExt::allow_directory`. Without this registration, `@tauri-apps/plugin-fs`'s `watch()` will refuse to attach.

## Capabilities

Capabilities are declared in `capabilities/default.json`. Current grants: `core:default`, `opener:default`, `fs:default`, `fs:allow-watch`, `store:default`. Any new Tauri plugin or fs operation likely needs a capability addition here.

## Cargo deps

`tauri-plugin-fs = { version = "2", features = ["watch"] }` — the `"watch"` feature is required by the frontend `useWorkspace` hook. Other plugins are stock.

## Adding a command

1. Define `#[tauri::command] fn ...` in `lib.rs`
2. Register it in the `tauri::generate_handler![...]` list
3. Add a thin wrapper in `src/api/<domain>.ts` and re-export it from `src/api/index.ts`
4. If the command writes to the file system, apply the canonicalize check from the security model section above

The frontend should never call `invoke("...")` directly — always go through the `src/api/` wrapper. This is enforced by `biome.json`.
