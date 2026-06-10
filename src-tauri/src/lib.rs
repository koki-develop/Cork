mod error;
mod frontmatter;
mod mcp;
mod menu;
mod security;
mod state;
mod status;
mod task;
mod workspace;

use state::AppState;
use tauri::Manager;

/// Fixed label used for the very first window created in `setup`. Every
/// subsequent window (the `New Window` menu, the macOS Dock reopen path)
/// gets a fresh `workspace-<n>` label from `AppState::next_window_label` —
/// `main` is never reused, even after that window has been closed. The
/// `capabilities/default.json` allowlist matches both `"main"` and the
/// `"workspace-*"` glob to cover this naming convention.
const MAIN_WINDOW_LABEL: &str = "main";

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            workspace::pick_directory,
            workspace::set_workspace_directory,
            workspace::get_workspace_directory,
            workspace::list_workspace_history,
            workspace::get_workspace_filters,
            workspace::set_workspace_filters,
            task::list_tasks,
            task::list_all_tags,
            task::create_task,
            task::update_task,
            task::move_task,
            task::renumber_tasks,
            task::delete_task,
            task::get_task,
            task::reconcile_external_status_changes,
            status::get_statuses,
            status::save_statuses,
            mcp::get_settings,
            mcp::update_settings,
            mcp::generate_token,
            mcp::get_sample_config,
            mcp::get_server_status,
        ])
        .on_window_event(|window, event| {
            // Drop per-window AppState entries when the window is gone for
            // good. `Destroyed` (not `CloseRequested`) is the right hook:
            // `CloseRequested` can be cancelled by `prevent_close()`, and
            // cleaning state for a window that's about to keep living
            // would break the next command issued from it. `Destroyed`
            // fires exactly once and only after the window is really gone.
            if let tauri::WindowEvent::Destroyed = event {
                window.state::<AppState>().remove_window(window.label());
            }
        })
        .setup(|app| {
            // Restore the most recently used workspace into the `main`
            // window's state *before* the window is built, so the frontend's
            // `useCurrentDir` reads the seeded value on its very first
            // `getWorkspaceDirectory` call. Doing this after `build()` would
            // race the webview's JS startup and drop the user into
            // WelcomePage despite a perfectly good history entry.
            workspace::seed_window_from_history(app.handle(), MAIN_WINDOW_LABEL);

            workspace::build_workspace_window(app.handle(), MAIN_WINDOW_LABEL)?;

            menu::setup(app)?;

            // Start the MCP server if persisted settings say so. A bind
            // failure here drops the runtime into `Failed` and lets setup
            // still succeed — the Kanban UI should never be blocked by MCP.
            //
            // `mcp::start` is `async` so its "must be called inside a Tokio
            // runtime context" contract is type-encoded — its body reaches
            // `Handle::current()` via `tokio::spawn` and
            // `TcpListener::from_std`. The `setup` hook itself runs outside
            // that context, so we drive `start` via Tauri's runtime
            // `block_on`.
            let mcp_settings = mcp::load_settings(app.handle());
            if mcp_settings.enabled {
                let state = app.state::<state::AppState>();
                match tauri::async_runtime::block_on(mcp::start(&mcp_settings)) {
                    Ok(handle) => state.set_mcp_runtime(mcp::McpRuntime::Running(handle)),
                    Err(e) => state.set_mcp_runtime(mcp::McpRuntime::Failed {
                        error: e.to_string(),
                    }),
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| {
        // The wildcard arm is mandatory: `RunEvent` is `#[non_exhaustive]`,
        // so future Tauri releases may add variants we don't care about.
        // Silently ignoring them keeps forward compatibility.
        match event {
            tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } => {
                // AppKit fires `applicationShouldHandleReopen` with
                // `hasVisibleWindows == false` for three distinct user
                // gestures: all windows closed, the app hidden via `Cmd+H`,
                // or every window minimised via `Cmd+M`.
                // `handle_macos_reopen` picks the right response — open a
                // fresh restored window only when truly no windows exist,
                // otherwise un-hide / un-minimise the ones that are still
                // around.
                workspace::handle_macos_reopen(app_handle);
            }
            tauri::RunEvent::ExitRequested {
                code: None, api, ..
            } => {
                // The user closed the last window. Default Tauri behaviour
                // is to set `ControlFlow::Exit` and kill the process here —
                // which on macOS violates the long-standing convention that
                // an app sticks around in the Dock until the user
                // explicitly quits. Without this prevent, the
                // `RunEvent::Reopen` handler above never gets a chance to
                // fire because there's no process left to receive the
                // event.
                //
                // We only block the `code: None` path — the user-window-
                // close cascade. Programmatic exits (`AppHandle::exit(N)`
                // / `AppHandle::restart()`) carry `code: Some(N)` and
                // terminate as requested. The predefined `Cork > Quit`
                // menu / `Cmd+Q` reaches AppKit's `terminate:` selector
                // by a separate path that, in Tauri 2.11, kills the
                // process via `applicationWillTerminate:` without coming
                // through this handler — verified by manual testing, but
                // worth re-checking on Tauri upgrades.
                api.prevent_exit();
            }
            tauri::RunEvent::Exit => {
                // Signal graceful shutdown on the running MCP server so the
                // axum task drains in-flight requests; `mcp::stop` bounds the
                // wait with a 1-second join timeout.
                if let Some(handle) = app_handle.state::<state::AppState>().take_mcp_handle() {
                    tauri::async_runtime::block_on(mcp::stop(handle));
                }
            }
            _ => {}
        }
    });
}
