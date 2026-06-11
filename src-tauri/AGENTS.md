# Rust backend (`src-tauri/`)

## Layout

`main.rs` is the entry point and calls `cork_lib::run()`. `lib.rs` only declares modules and wires plugins, state, `#[tauri::command]`s, the `on_window_event` cleanup hook, and the macOS `RunEvent::Reopen` handler in `run()` — domain logic lives in the per-module files below.

```
src-tauri/src/
├── main.rs            entry point (cork_lib::run())
├── lib.rs             mod declarations + run() + Reopen handler + main window seed + MCP setup/stop
├── state.rs           AppState (per-window workspace / cache / snapshot maps + process-global MCP runtime)
├── error.rs           CommandError + CmdResult<T>
├── security.rs        workspace-scope path checks
├── frontmatter.rs     YAML frontmatter parse / update / serialize
├── menu.rs            macOS menu (Cork / File > New Task + New Window / Edit / Window) + focused-window settings/create-task emit
├── workspace.rs       workspace commands (pick_directory, set/get_workspace_directory, get/set_workspace_filters, list_workspace_history) + workspace history + open_new_window_impl + build_workspace_window + seed_window_from_history + handle_macos_reopen
├── task.rs            Task type + task commands (list/get/create/update/delete/renumber, ...)
├── status.rs          StatusEntry type + status commands + .cork.json read/write
└── mcp.rs             Embedded MCP server (Streamable HTTP transport, Bearer auth + workspace header middleware, `list_tasks` tool, settings persistence, lifecycle start/stop)
```

## State

`AppState` (defined in `state.rs`) holds **per-window** state so two windows can keep independent workspaces, caches, and reconciliation snapshots, plus **one process-global slot** for the MCP server runtime:

- `windows: Mutex<HashMap<String, WindowState>>` — window label → `WindowState { workspace, tasks_cache, last_reported }`. Bundling all three fields under one lock is what makes `set_workspace`'s cascade ("replace workspace, drop cache, clear snapshot") atomic — a concurrent reader on the same window can never observe a half-applied transition.
- `next_window_id: AtomicU64` — monotonic counter feeding `next_window_label`
- `mcp_runtime: Mutex<McpRuntime>` — process-global, not per-window. The MCP server is a single TCP listener bound for the whole Cork process; the `McpRuntime` enum (`Stopped` / `Running(McpHandle)` / `Failed { error }`) makes "we have a live handle" and "we know why bind failed" mutually exclusive, so the runtime can never drift into a "handle missing but error unset" state.

All public methods take a `label: &str` so commands stay scoped to the calling window. Always go through the API rather than locking directly:

- `state.workspace(label) -> Option<PathBuf>` — clone-and-release; returns `None` if unset
- `state.require_workspace(label) -> CmdResult<PathBuf>` — returns `CommandError::NoWorkspace` if unset
- `state.set_workspace(label, dir)` — replaces the workspace for one window and clears **only that window's** cache + last_reported snapshot
- `state.remove_window(label)` — drops every entry tied to a closed window; called from the `WindowEvent::Destroyed` hook in `lib.rs`
- `state.next_window_label() -> String` — mints `workspace-<n>` labels for new windows (Reopen / File > New Window). Strictly monotonic for the process lifetime — closed window numbers are never reused

MCP-runtime accessors (single global slot, no `label` argument):

- `state.set_mcp_runtime(runtime)` — replace the runtime slot wholesale (used at setup, on Toggle ON/OFF, and on bind result)
- `state.take_mcp_handle() -> Option<McpHandle>` — atomically take the handle out of `Running` and leave `Stopped` in its place; `Failed` / `Stopped` are preserved so a Failed error is never lost while probing
- `state.mcp_status() -> McpStatus` — read-only projection used by `get_server_status` / `update_settings` return values
- `state.with_mcp_handle(f)` — borrow the live handle for in-place mutation (token hot-swap during a token-only settings change); no-op for non-`Running` runtimes
- `state.is_mcp_running() -> bool` — lightweight predicate for the `update_settings` diff branch

The label `"main"` is reserved for the first window created in `lib.rs::setup`. Every other window gets a fresh `workspace-<n>` label from `next_window_label`. The `capabilities/default.json` allowlist matches both `"main"` and `"workspace-*"` to cover this naming convention.

## Error type

Commands return `CmdResult<T> = Result<T, CommandError>` (see `error.rs`). `CommandError` serializes to the same plain string the frontend has always seen (`"Access denied"`, `"No directory selected"`, etc.), so the wire format is unchanged. `std::io::Error` is wrapped via `From`, so `?` works directly on `fs::*` calls; for other errors use `.map_err(CommandError::other)?`.

## Security model

Frontend write commands take a `path` argument. They **must** verify the path lives inside the workspace via `security::ensure_in_workspace(&dir, Path::new(&path))?` (or `check_in_workspace` when iterating against a pre-canonicalized workspace). The helper canonicalizes both paths and returns `CommandError::AccessDenied` on escape via symlinks or `..` segments. Any new write command must follow this pattern.

## Workspace registration

`workspace::set_workspace_directory` saves the path to `AppState` + `tauri_plugin_store` **and** registers it with `fs_scope()` via `FsExt::allow_directory`. Without this registration, `@tauri-apps/plugin-fs`'s `watch()` will refuse to attach.

## Capabilities

Capabilities are declared in `capabilities/default.json`. The `windows` field is `["main", "workspace-*"]` so the same permission set applies to the startup window and every additional window opened via `File > New Window` or the macOS Dock reopen path. Current grants: `core:default`, `core:window:allow-start-dragging`, `opener:default`, `fs:default`, `fs:allow-watch`, `store:default`. Any new Tauri plugin or fs operation likely needs a capability addition here.

## Cargo deps

`tauri-plugin-fs = { version = "2", features = ["watch"] }` — the `"watch"` feature is required by the frontend `useWorkspace` hook. Other plugins are stock.

MCP-related deps live under the same `[dependencies]` block: `rmcp` (server + `transport-streamable-http-server` + `macros` + `schemars` features — gives us `#[tool_router]` / `#[tool_handler]` macros and the Streamable HTTP transport), `axum` (rmcp's transport mounts a service onto an axum `Router`, and our middleware layers are axum `from_fn` / `from_fn_with_state`), `tokio` with `sync` + `time` + `rt` + `fs` features (`fs` is for the async `canonicalize` / `metadata` in `workspace_layer`; blocking versions would pin a runtime worker on disk I/O in the request hot path), `tokio-util` for `CancellationToken`, `rand` (CSRNG-backed `OsRng` for token minting), `subtle` (constant-time string compare in `auth_layer`), `schemars` (JSON Schema generation for the tool's `outputSchema`), `http` (raw `Request<Parts>` extraction in the `list_tasks` handler).

Dev-dependencies: `tempfile` (filesystem-touching unit tests), `tower` with `util` feature (for `ServiceExt::oneshot` — drives a built axum `Router` through one request inside the middleware tests).

## Tests

Unit tests live inline at the bottom of each module under `#[cfg(test)] mod tests`. Run them with `cargo test` (from `src-tauri/` or via `bun run tauri` won't trigger them — use cargo directly).

Covered modules:

- `error.rs` — Display / Serialize / `From<io::Error>` / `CommandError::other`
- `state.rs` — `AppState` API + cross-thread sharing via `Arc` + per-window isolation, `remove_window`, `next_window_label` monotonicity / thread safety, `set_workspace` scoping invariant, MCP runtime transitions (`Stopped` / `Failed` / `is_mcp_running` predicate, `with_mcp_handle` non-`Running` no-op)
- `security.rs` — `canonical_workspace` / `ensure_in_workspace` / `check_in_workspace`, including symlink and `..` escape rejection
- `frontmatter.rs` — `parse` / `update` / `serialize` and the private `format_yaml_float`
- `task.rs` — `sanitize_title`, `read_task_preview`, and `compute_reconciled_orders` (including the multi-window invariant that internal moves with `status` and `order` both changed don't trigger external-edit repair)
- `workspace.rs` — `parse_workspace_history` / `history_to_json` / `prepend_unique_capped` (workspace-history pure helpers), `update_workspaces_map` (persisted-store mutation), and `filter_existing_directories` (the `is_dir()` survival filter backing `list_workspace_history`)
- `mcp.rs` — token minting / validation / `McpSettings` round-trip / store-key wire-shape pinning / `resolve_settings` (cold-start + corrupt-token rotation, preserving `enabled`), `slug_for_workspace`, `build_sample_config` (single / multi / duplicate-slug disambiguation / stable FNV-1a), `McpRuntime` / `McpStatus` / `McpStartError` (Display + tagged-enum wire format), `is_token_only_change` branches, `auth_layer` (matching Bearer / mismatch / missing / lowercase `bearer` NG / extra-whitespace NG / `WWW-Authenticate` header presence), `workspace_layer` (valid dir / missing header / empty value / non-existent path / file-not-dir), tool-router registration end-to-end (`CorkMcpServer::tool_router()` doesn't panic on the MCP `outputSchema` root-must-be-object validation; `ListTasksOutput` schema root is `object`), `list_tasks` pagination (`resolve_limit` default/clamp, `paginate` page boundaries / offset-past-end / `has_more`)

Not covered: `#[tauri::command]` bodies themselves (they require a Tauri runtime), `menu::setup`, `workspace::pick_directory` (GUI), and `workspace::set/get_workspace_directory` (need `AppHandle`). The `mcp` commands (`get_settings` / `update_settings` / `generate_token` / `get_sample_config` / `get_server_status`) likewise wrap tested helpers — `load_settings` / `save_settings` (Tauri-runtime-bound) and `start` / `stop` (Tokio-runtime-bound) are exercised manually via the dev build's `bun run tauri dev` flow (see `openspec/changes/archive/2026-06-10-mcp-server/tasks.md` section 13). The commands are thin wrappers over the tested helpers, so the practical risk of skipping them is small.

## Adding a command

1. Pick the right module (`workspace.rs` / `task.rs` / `status.rs`), or create a new domain file and declare it in `lib.rs`
2. Define `#[tauri::command] pub fn ...` returning `CmdResult<T>` (or a plain value). **Take `window: tauri::WebviewWindow` as a parameter** if the command needs workspace state — every `state.*` call requires a `&str` label, so you'll pass `window.label()` through to keep the scope per-window. The Tauri runtime injects this argument automatically; the frontend wrapper doesn't change
3. Register it in the `tauri::generate_handler![...]` list in `lib.rs` as `domain::name`
4. If the command writes to the file system, call `security::ensure_in_workspace` first
5. Add a thin wrapper in `src/api/<domain>.ts` and re-export it from `src/api/index.ts`

The frontend should never call `invoke("...")` directly — always go through the `src/api/` wrapper. This is enforced by `.oxlintrc.json`.
