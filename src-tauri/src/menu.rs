use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{App, Emitter, EventTarget, Manager};

/// Pick the WebviewWindow that currently has keyboard focus, if any. Tauri
/// 2.11 only exposes a direct `get_focused_window` on the `Manager` trait
/// behind the `unstable` feature flag; we don't want to enable that for one
/// helper, so we walk every managed webview and ask each one whether it's
/// focused. The first match wins — there can only be one focused window per
/// process at a time, and `is_focused()` failures are degraded to `false`
/// (the worst case is the menu event silently no-ops, which is harmless).
fn focused_webview_window(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    app.webview_windows()
        .into_values()
        .find(|w| w.is_focused().unwrap_or(false))
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    let settings_item = MenuItemBuilder::with_id("settings", "Settings...")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    let new_task_item = MenuItemBuilder::with_id("new_task", "New Task")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;

    let new_window_item = MenuItemBuilder::with_id("new_window", "New Window")
        .accelerator("CmdOrCtrl+Shift+N")
        .build(app)?;

    let reload_item = MenuItemBuilder::with_id("reload", "Reload")
        .accelerator("CmdOrCtrl+R")
        .build(app)?;

    let app_menu = SubmenuBuilder::new(app, "Cork")
        .about(None)
        .separator()
        .item(&settings_item)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_task_item)
        .separator()
        .item(&new_window_item)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View").item(&reload_item).build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu])
        .build()?;

    app.set_menu(menu)?;

    app.on_menu_event(|app, event| match event.id().0.as_str() {
        "settings" => {
            // Multi-window emit scoping. Two ingredients have to cooperate
            // for the notification to land on exactly one window:
            //
            //   1. Pick the focused window via `focused_webview_window`,
            //      which walks `webview_windows()` and asks each
            //      `is_focused`. (`Manager::get_focused_window` does the
            //      same in one call but is gated behind the `unstable`
            //      feature flag in Tauri 2.11.)
            //
            //   2. `emit_to(EventTarget::webview_window(label), …)` so the
            //      backend's `filter_target` check (see
            //      `manager::Manager::emit_to`) only allows listeners whose
            //      target matches that exact label. `WebviewWindow::emit`
            //      alone is *not* enough on its own — it goes through the
            //      same matcher, but Tauri's matcher short-circuits to
            //      `true` for any listener registered with
            //      `EventTarget::Any`, which is what the default JS
            //      `listen()` helper uses. The frontend pairs us by
            //      registering through `getCurrentWebviewWindow().listen`
            //      so the listener target is the WebviewWindow's label —
            //      that's what lets our `emit_to` filter actually
            //      discriminate.
            //
            // If we can't identify a focused window (rare; e.g. focus is in
            // another app at the moment the accelerator fires) the event is
            // dropped: no data is at risk, the worst case is the user has
            // to press `Cmd+,` again with Cork in the foreground.
            if let Some(window) = focused_webview_window(app) {
                let target = EventTarget::webview_window(window.label());
                let _ = app.emit_to(target, "menu:open-settings", ());
            }
        }
        "new_task" => {
            if let Some(window) = focused_webview_window(app) {
                let target = EventTarget::webview_window(window.label());
                let _ = app.emit_to(target, "menu:open-create-task", ());
            }
        }
        "new_window" => {
            if let Err(e) = crate::workspace::open_new_window_impl(app) {
                eprintln!("failed to open new window from menu: {e}");
            }
        }
        "reload" => {
            // Reload is a per-window action — `WebviewWindow::reload()` only
            // touches the webview it's called on. We scope to the focused
            // window the same way `settings` / `new_task` do, so pressing
            // Cmd+R only refreshes the window the user is looking at.
            // Drop silently when no window has focus (e.g. focus is in
            // another app); the worst case is the user presses Cmd+R again.
            if let Some(window) = focused_webview_window(app) {
                if let Err(e) = window.reload() {
                    eprintln!("failed to reload window: {e}");
                }
            }
        }
        _ => {}
    });

    Ok(())
}
