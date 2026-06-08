# Rust backend (`src-tauri/`)

## Layout

`main.rs` is the entry point and calls `cork_lib::run()`. `lib.rs` only declares modules and wires plugins, state, and `#[tauri::command]`s in `run()` — domain logic lives in the per-module files below.

```
src-tauri/src/
├── main.rs            entry point (cork_lib::run())
├── lib.rs             mod declarations + run()
├── state.rs           AppState
├── error.rs           CommandError + CmdResult<T>
├── security.rs        workspace-scope path checks
├── frontmatter.rs     YAML frontmatter parse / update / serialize
├── menu.rs            macOS menu setup
├── workspace.rs       workspace commands (pick_directory, set/get_workspace_directory, get/set_workspace_filters) + workspace history
├── task.rs            Task type + task commands (list/get/create/update/delete/renumber, ...)
└── status.rs          StatusEntry type + status commands + .cork.json read/write
```

## State

`AppState { Mutex<Option<PathBuf>> }` (defined in `state.rs`) holds the currently selected workspace directory. Always go through the API rather than locking directly:

- `state.workspace() -> Option<PathBuf>` — clone-and-release; returns `None` if unset
- `state.require_workspace() -> CmdResult<PathBuf>` — returns `CommandError::NoWorkspace` if unset
- `state.set_workspace(dir: PathBuf)`

## Error type

Commands return `CmdResult<T> = Result<T, CommandError>` (see `error.rs`). `CommandError` serializes to the same plain string the frontend has always seen (`"Access denied"`, `"No directory selected"`, etc.), so the wire format is unchanged. `std::io::Error` is wrapped via `From`, so `?` works directly on `fs::*` calls; for other errors use `.map_err(CommandError::other)?`.

## Security model

Frontend write commands take a `path` argument. They **must** verify the path lives inside the workspace via `security::ensure_in_workspace(&dir, Path::new(&path))?` (or `check_in_workspace` when iterating against a pre-canonicalized workspace). The helper canonicalizes both paths and returns `CommandError::AccessDenied` on escape via symlinks or `..` segments. Any new write command must follow this pattern.

## Workspace registration

`workspace::set_workspace_directory` saves the path to `AppState` + `tauri_plugin_store` **and** registers it with `fs_scope()` via `FsExt::allow_directory`. Without this registration, `@tauri-apps/plugin-fs`'s `watch()` will refuse to attach.

## Capabilities

Capabilities are declared in `capabilities/default.json`. Current grants: `core:default`, `core:window:allow-start-dragging`, `opener:default`, `fs:default`, `fs:allow-watch`, `store:default`. Any new Tauri plugin or fs operation likely needs a capability addition here.

## Cargo deps

`tauri-plugin-fs = { version = "2", features = ["watch"] }` — the `"watch"` feature is required by the frontend `useWorkspace` hook. Other plugins are stock. `tempfile` is a dev-dependency used by unit tests that touch the filesystem.

## Tests

Unit tests live inline at the bottom of each module under `#[cfg(test)] mod tests`. Run them with `cargo test` (from `src-tauri/` or via `bun run tauri` won't trigger them — use cargo directly).

Covered modules:

- `error.rs` — Display / Serialize / `From<io::Error>` / `CommandError::other`
- `state.rs` — `AppState` API + cross-thread sharing via `Arc`
- `security.rs` — `canonical_workspace` / `ensure_in_workspace` / `check_in_workspace`, including symlink and `..` escape rejection
- `frontmatter.rs` — `parse` / `update` / `serialize` and the private `format_yaml_float`
- `task.rs` — `sanitize_title` and `read_task_preview`
- `workspace.rs` — `parse_workspace_history` / `history_to_json` / `prepend_unique_capped` (workspace-history pure helpers) and `update_workspaces_map` (persisted-store mutation)

Not covered: `#[tauri::command]` bodies themselves (they require a Tauri runtime), `menu::setup`, `workspace::pick_directory` (GUI), and `workspace::set/get_workspace_directory` (need `AppHandle`). The commands are thin wrappers over the tested helpers, so the practical risk of skipping them is small.

## Adding a command

1. Pick the right module (`workspace.rs` / `task.rs` / `status.rs`), or create a new domain file and declare it in `lib.rs`
2. Define `#[tauri::command] pub fn ...` returning `CmdResult<T>` (or a plain value)
3. Register it in the `tauri::generate_handler![...]` list in `lib.rs` as `domain::name`
4. If the command writes to the file system, call `security::ensure_in_workspace` first
5. Add a thin wrapper in `src/api/<domain>.ts` and re-export it from `src/api/index.ts`

The frontend should never call `invoke("...")` directly — always go through the `src/api/` wrapper. This is enforced by `.oxlintrc.json`.
