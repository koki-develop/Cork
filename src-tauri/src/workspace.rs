use crate::error::{CmdResult, CommandError};
use crate::state::AppState;
use crate::task::TagFilter;
use std::path::PathBuf;
use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_fs::FsExt;
use tauri_plugin_store::StoreExt;

pub(crate) const SETTINGS_FILE: &str = "settings.json";

/// Persisted as a JSON array of path strings, most recent first.
const WORKSPACE_HISTORY_KEY: &str = "workspace_history";

/// Upper bound on the persisted workspace history. The newest entry sits at
/// index 0; once the list reaches this cap, every subsequent
/// `set_workspace_directory` drops the oldest tail entry to make room (see
/// `prepend_unique_capped`). The number is shared by `RecentWorkspacesList`'s
/// `max-h-72 overflow-y-auto` sizing — bump this and the welcome-page list
/// stays usable, but the on-disk store of any user who shrinks the cap will
/// only truncate on the next write.
const MAX_WORKSPACE_HISTORY: usize = 50;

// Per-workspace settings live under `workspaces.<path>.<setting>`. New
// workspace-scoped settings should be added as additional sub-keys without
// requiring a top-level schema change.
const WORKSPACES_KEY: &str = "workspaces";
const FILTERS_SUBKEY: &str = "filters";

/// Persisted filter type — same wire format as the IPC `TagFilter` enum
/// (`{"operator":"contains","tags":[...]}` / `{"operator":"is_empty"}`).
pub type StoredFilter = TagFilter;

#[tauri::command]
pub fn pick_directory() -> Option<String> {
    rfd::FileDialog::new()
        .pick_folder()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn set_workspace_directory(
    window: tauri::WebviewWindow,
    path: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> CmdResult<()> {
    let dir = PathBuf::from(&path);

    // Do every fallible side-effect *before* touching AppState. If any of
    // the fs-scope registration, the store open, or the store save fails,
    // we return an error with no in-memory state changed — the frontend
    // sees the failure and stays on its previous workspace. The earlier
    // ordering (state mutate → fs_scope → store) left a torn window where
    // AppState already pointed at the new directory while fs_scope hadn't
    // been registered, so the per-window watcher would then refuse to
    // attach despite BoardPage thinking the workspace had switched.
    app.fs_scope()
        .allow_directory(&dir, false)
        .map_err(CommandError::other)?;
    let store = app.store(SETTINGS_FILE).map_err(CommandError::other)?;
    let existing = store.get(WORKSPACE_HISTORY_KEY);
    let history = parse_workspace_history(existing.as_ref());
    let updated = prepend_unique_capped(history, path, MAX_WORKSPACE_HISTORY);
    store.set(WORKSPACE_HISTORY_KEY, history_to_json(&updated));
    store.save().map_err(CommandError::other)?;

    state.set_workspace(window.label(), dir);
    Ok(())
}

#[tauri::command]
pub fn get_workspace_directory(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AppState>,
) -> Option<String> {
    // No history fallback here: that auto-restore now lives in
    // `seed_window_from_history` (called from `lib.rs::setup` for the `main`
    // window at process start, and from the `RunEvent::Reopen` handler for
    // Dock-revive). Putting the fallback in this command would re-introduce
    // the multi-window bug where a freshly-opened "New Window" window would
    // silently inherit the most-recent workspace instead of starting in the
    // empty welcome state — the command runs per-window and would happily
    // fill in any window that asks.
    state
        .workspace(window.label())
        .map(|dir| dir.to_string_lossy().to_string())
}

/// List of workspaces that the user has previously opened, filtered down to
/// directories that still exist on disk. Backs the "Recent Workspaces" panel
/// on the welcome page.
///
/// The persisted `workspace_history` value is **not** mutated — entries that
/// fail `is_dir()` are merely hidden from this response. A workspace whose
/// disk is temporarily unmounted will reappear in the picker as soon as the
/// drive comes back online, instead of being silently forgotten.
#[tauri::command]
pub fn list_workspace_history(app: tauri::AppHandle) -> Vec<String> {
    let Ok(store) = app.store(SETTINGS_FILE) else {
        return Vec::new();
    };
    let history = parse_workspace_history(store.get(WORKSPACE_HISTORY_KEY).as_ref());
    filter_existing_directories(&history)
}

/// Apply the same `is_dir()` survival check the welcome page uses, without
/// touching the persisted history. Pulled out as a pure helper so the
/// behaviour can be exercised by unit tests without spinning up a Tauri
/// runtime.
fn filter_existing_directories(history: &[String]) -> Vec<String> {
    history
        .iter()
        .filter(|s| PathBuf::from(s).is_dir())
        .cloned()
        .collect()
}

/// Seed a window's workspace from the persisted history. Shared by
/// `lib.rs::setup` (called once at process start to restore `main`) and the
/// macOS Dock-reopen handler (called when the user re-activates Cork after
/// closing every window).
///
/// **Order matters at call sites**: the AppState write must complete *before*
/// the corresponding window is built, otherwise the frontend's
/// `useCurrentDir` can race the seed and read `None` from
/// `get_workspace_directory`, dropping the user into WelcomePage when they
/// expected BoardPage.
///
/// History entries that no longer resolve to a directory are skipped (drive
/// unplugged, directory deleted, replaced by a file); the first surviving
/// entry wins. The persisted history itself is left untouched — startup /
/// reopen is a "read the most recent intent" event, not a new open event,
/// so the order remains driven exclusively by `set_workspace_directory`
/// calls.
pub fn seed_window_from_history(app: &tauri::AppHandle, label: &str) {
    let Ok(store) = app.store(SETTINGS_FILE) else {
        return;
    };
    let history = parse_workspace_history(store.get(WORKSPACE_HISTORY_KEY).as_ref());
    let Some(dir) = history
        .into_iter()
        .map(PathBuf::from)
        .find(|p| p.is_dir())
    else {
        return;
    };

    let state = app.state::<AppState>();
    state.set_workspace(label, dir.clone());
    if let Err(e) = app.fs_scope().allow_directory(&dir, false) {
        eprintln!("failed to allow directory in fs scope: {e}");
    }
}

/// macOS window dressing applied to both the `main` window (in `lib.rs::setup`)
/// and to every subsequent `workspace-<n>` window opened via the menu or the
/// Reopen handler. Pulled out so the two call sites can't drift apart
/// visually.
fn apply_macos_window_chrome(window: &WebviewWindow) {
    use objc2_app_kit::{NSColor, NSWindow};

    if let Ok(ns_window_ptr) = window.ns_window() {
        let ns_window_ptr = ns_window_ptr as *mut NSWindow;
        // SAFETY: Tauri's `ns_window()` returns a valid `NSWindow*` for the
        // lifetime of the WebviewWindow. We only deref it for the duration of
        // the call to set the background colour and immediately let the
        // reference go.
        let ns_window = unsafe { &*ns_window_ptr };
        let bg_color = NSColor::colorWithRed_green_blue_alpha(
            2.0 / 255.0,
            6.0 / 255.0,
            23.0 / 255.0,
            1.0,
        );
        ns_window.setBackgroundColor(Some(&bg_color));
    }
}

/// Build a workspace-flavoured `WebviewWindow`. This is the single source of
/// truth for window sizing, title-bar style, and macOS background colour — if
/// you tweak any visual property here it propagates to every window the app
/// can open (startup `main`, `New Window` menu, Dock reopen).
pub(crate) fn build_workspace_window(
    app: &tauri::AppHandle,
    label: &str,
) -> tauri::Result<WebviewWindow> {
    let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::default())
        .title("")
        .inner_size(1280.0, 800.0);

    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .traffic_light_position(tauri::LogicalPosition::new(20.0, 28.0));

    let window = builder.build()?;

    apply_macos_window_chrome(&window);

    Ok(window)
}

/// Open a brand-new welcome window. Wired up to the `File > New Window` menu
/// item — *not* exposed as a Tauri command, because v1 has no frontend caller
/// for this path. The new window is deliberately left without a workspace
/// seeded into `AppState`, so the frontend boots into WelcomePage and lets
/// the user choose between the directory picker and the Recent Workspaces
/// list.
pub(crate) fn open_new_window_impl(app: &tauri::AppHandle) -> tauri::Result<WebviewWindow> {
    let state = app.state::<AppState>();
    let label = state.next_window_label();
    build_workspace_window(app, &label)
}

fn reopen_with_history_restore(app: &tauri::AppHandle) -> tauri::Result<WebviewWindow> {
    let state = app.state::<AppState>();
    let label = state.next_window_label();
    // Seed FIRST, build SECOND — the webview's JS execution starts as soon as
    // `build()` returns, so a seed-after-build sequence would let
    // `useCurrentDir` race and read `None` before the AppState write lands.
    // `next_window_label` already gave us the label we need to seed under, so
    // there's no chicken-and-egg here.
    seed_window_from_history(app, &label);
    match build_workspace_window(app, &label) {
        Ok(window) => Ok(window),
        Err(e) => {
            // The build failed after we already wrote the seeded workspace
            // into AppState for this label. No `WindowEvent::Destroyed`
            // will ever fire for a window that never existed, so without
            // this explicit cleanup the entry would leak across the
            // process's lifetime.
            app.state::<AppState>().remove_window(&label);
            Err(e)
        }
    }
}

/// macOS Dock-icon reactivation path. Called from the `RunEvent::Reopen`
/// handler in `lib.rs::run` whenever AppKit's
/// `applicationShouldHandleReopen:hasVisibleWindows:` reports
/// `hasVisibleWindows == false`.
///
/// That single signal covers three distinct user states — all windows closed,
/// the app hidden via `Cmd+H`, every window minimised via `Cmd+M` — and the
/// correct response differs:
///
/// - **Truly zero windows**: open a fresh `workspace-<n>` window and seed it
///   with the most recent live workspace so the user is dropped right back
///   where they left off, mirroring the cold-start UX.
/// - **Hidden or minimised**: every window still exists, so don't pile a new
///   one on top — instead un-minimise, un-hide, and refocus each existing
///   window. Creating another window in this branch would be the headline
///   bug this whole helper exists to avoid.
pub(crate) fn handle_macos_reopen(app: &tauri::AppHandle) {
    let windows = app.webview_windows();
    if windows.is_empty() {
        if let Err(e) = reopen_with_history_restore(app) {
            eprintln!("failed to open a window in response to Dock reopen: {e}");
        }
        return;
    }
    for (_, window) in windows {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Lenient on input shape: a missing key, a non-array value, or non-string
/// array entries produce an empty list rather than an error. The history is
/// best-effort UX state — refusing to start because of a hand-edited
/// settings file would be worse than dropping the bad entries and letting
/// the next write rebuild it cleanly.
fn parse_workspace_history(value: Option<&serde_json::Value>) -> Vec<String> {
    match value {
        Some(serde_json::Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        _ => Vec::new(),
    }
}

fn prepend_unique_capped(mut list: Vec<String>, new: String, cap: usize) -> Vec<String> {
    list.retain(|p| p != &new);
    list.insert(0, new);
    list.truncate(cap);
    list
}

fn history_to_json(history: &[String]) -> serde_json::Value {
    serde_json::Value::Array(
        history
            .iter()
            .cloned()
            .map(serde_json::Value::String)
            .collect(),
    )
}

#[tauri::command]
pub fn get_workspace_filters(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> CmdResult<Vec<StoredFilter>> {
    let dir = state.require_workspace(window.label())?;
    let key = dir.to_string_lossy().to_string();
    let store = app.store(SETTINGS_FILE).map_err(CommandError::other)?;
    let Some(workspaces_value) = store.get(WORKSPACES_KEY) else {
        return Ok(Vec::new());
    };
    let workspaces = workspaces_value
        .as_object()
        .ok_or_else(|| CommandError::other("`workspaces` key is corrupted"))?;
    let Some(workspace_entry) = workspaces.get(&key) else {
        return Ok(Vec::new());
    };
    let workspace = workspace_entry
        .as_object()
        .ok_or_else(|| CommandError::other(format!("`workspaces.{}` is corrupted", key)))?;
    let Some(filters_value) = workspace.get(FILTERS_SUBKEY) else {
        return Ok(Vec::new());
    };
    serde_json::from_value::<Vec<StoredFilter>>(filters_value.clone()).map_err(CommandError::other)
}

/// Set or remove a single setting on a workspace, returning the new top-level
/// `workspaces` map (or `None` if it should be deleted entirely).
///
/// Returns:
/// - `Ok(Some(new_map))` — write under `WORKSPACES_KEY`.
/// - `Ok(None)` — top-level map is empty after the update; caller should
///   delete `WORKSPACES_KEY`.
/// - `Err(...)` — existing value is corrupt; refuse to silently wipe.
fn update_workspaces_map(
    existing: Option<&serde_json::Value>,
    workspace_key: &str,
    setting_key: &str,
    setting_value: Option<serde_json::Value>,
) -> CmdResult<Option<serde_json::Map<String, serde_json::Value>>> {
    let mut workspaces: serde_json::Map<String, serde_json::Value> = match existing {
        Some(value) => value
            .as_object()
            .cloned()
            .ok_or_else(|| CommandError::other("`workspaces` key is corrupted"))?,
        None => serde_json::Map::new(),
    };

    let mut workspace_obj: serde_json::Map<String, serde_json::Value> =
        match workspaces.get(workspace_key) {
            Some(value) => value.as_object().cloned().ok_or_else(|| {
                CommandError::other(format!("`workspaces.{}` is corrupted", workspace_key))
            })?,
            None => serde_json::Map::new(),
        };

    match setting_value {
        Some(v) => {
            workspace_obj.insert(setting_key.to_string(), v);
        }
        None => {
            workspace_obj.remove(setting_key);
        }
    }

    // Collapse empty workspace entries so the store doesn't accumulate stale
    // keys, but only when the entire sub-object is empty (preserves siblings).
    if workspace_obj.is_empty() {
        workspaces.remove(workspace_key);
    } else {
        workspaces.insert(
            workspace_key.to_string(),
            serde_json::Value::Object(workspace_obj),
        );
    }

    if workspaces.is_empty() {
        Ok(None)
    } else {
        Ok(Some(workspaces))
    }
}

#[tauri::command]
pub fn set_workspace_filters(
    window: tauri::WebviewWindow,
    filters: Vec<StoredFilter>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> CmdResult<()> {
    let dir = state.require_workspace(window.label())?;
    let key = dir.to_string_lossy().to_string();
    let store = app.store(SETTINGS_FILE).map_err(CommandError::other)?;

    let setting_value = if filters.is_empty() {
        None
    } else {
        Some(serde_json::to_value(&filters).map_err(CommandError::other)?)
    };

    let existing = store.get(WORKSPACES_KEY);
    match update_workspaces_map(existing.as_ref(), &key, FILTERS_SUBKEY, setting_value)? {
        Some(map) => store.set(WORKSPACES_KEY, serde_json::Value::Object(map)),
        None => {
            store.delete(WORKSPACES_KEY);
        }
    }

    store.save().map_err(CommandError::other)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    fn filters_json(tags: &[&str]) -> serde_json::Value {
        json!([{"operator": "contains", "tags": tags}])
    }

    // --- filter_existing_directories -------------------------------------------

    #[test]
    fn filter_existing_directories_keeps_only_real_dirs() {
        // Build a small mix on a real temp filesystem so `is_dir()` actually
        // discriminates: two real dirs, one missing path, one regular file.
        let tmp = TempDir::new().unwrap();
        let dir_a = tmp.path().join("a");
        let dir_b = tmp.path().join("b");
        let file_c = tmp.path().join("c.txt");
        let missing = tmp.path().join("does-not-exist");
        std::fs::create_dir(&dir_a).unwrap();
        std::fs::create_dir(&dir_b).unwrap();
        std::fs::write(&file_c, "").unwrap();

        let history = vec![
            dir_a.to_string_lossy().to_string(),
            missing.to_string_lossy().to_string(),
            dir_b.to_string_lossy().to_string(),
            file_c.to_string_lossy().to_string(),
        ];

        let result = filter_existing_directories(&history);
        assert_eq!(
            result,
            vec![
                dir_a.to_string_lossy().to_string(),
                dir_b.to_string_lossy().to_string(),
            ],
        );
    }

    #[test]
    fn filter_existing_directories_preserves_order() {
        // Same survival check, but the relative order of the survivors must
        // not change — Recent Workspaces UI presents most-recent-first.
        let tmp = TempDir::new().unwrap();
        let dir_first = tmp.path().join("first");
        let dir_last = tmp.path().join("last");
        std::fs::create_dir(&dir_first).unwrap();
        std::fs::create_dir(&dir_last).unwrap();
        let missing = tmp.path().join("ghost");

        let history = vec![
            dir_first.to_string_lossy().to_string(),
            missing.to_string_lossy().to_string(),
            dir_last.to_string_lossy().to_string(),
        ];

        let result = filter_existing_directories(&history);
        assert_eq!(result[0], dir_first.to_string_lossy().to_string());
        assert_eq!(result[1], dir_last.to_string_lossy().to_string());
    }

    #[test]
    fn filter_existing_directories_empty_input_returns_empty() {
        assert!(filter_existing_directories(&[]).is_empty());
    }

    #[test]
    fn filter_existing_directories_does_not_mutate_input() {
        // The persisted history list must stay intact — survival filtering
        // is a *view* of the history, not a clean-up pass.
        let tmp = TempDir::new().unwrap();
        let dir_alive = tmp.path().join("alive");
        std::fs::create_dir(&dir_alive).unwrap();
        let missing = tmp.path().join("gone");

        let original = vec![
            dir_alive.to_string_lossy().to_string(),
            missing.to_string_lossy().to_string(),
        ];
        let cloned = original.clone();
        let _ = filter_existing_directories(&original);
        assert_eq!(original, cloned);
    }

    #[test]
    fn update_workspaces_inserts_into_empty_store() {
        let value = filters_json(&["bug"]);
        let result = update_workspaces_map(None, "/path/a", FILTERS_SUBKEY, Some(value)).unwrap();
        let map = result.expect("non-empty map expected");
        let entry = map.get("/path/a").unwrap().as_object().unwrap();
        assert!(entry.contains_key("filters"));
    }

    #[test]
    fn update_workspaces_overwrites_existing_setting() {
        let existing = json!({
            "/path/a": { "filters": [{"operator": "contains", "tags": ["old"]}] }
        });
        let result = update_workspaces_map(
            Some(&existing),
            "/path/a",
            FILTERS_SUBKEY,
            Some(filters_json(&["new"])),
        )
        .unwrap();
        let map = result.expect("non-empty map expected");
        let s = map.get("/path/a").unwrap().to_string();
        assert!(s.contains("\"new\""));
        assert!(!s.contains("\"old\""));
    }

    #[test]
    fn update_workspaces_removes_setting_when_value_is_none() {
        let existing = json!({
            "/path/a": { "filters": [{"operator": "contains", "tags": ["bug"]}], "other": 1 }
        });
        let result =
            update_workspaces_map(Some(&existing), "/path/a", FILTERS_SUBKEY, None).unwrap();
        let map = result.expect("non-empty map expected (`other` remains)");
        let entry = map.get("/path/a").unwrap().as_object().unwrap();
        assert!(!entry.contains_key("filters"));
        assert!(entry.contains_key("other"));
    }

    #[test]
    fn update_workspaces_drops_workspace_when_last_setting_removed() {
        let existing = json!({
            "/path/a": { "filters": [{"operator": "contains", "tags": ["bug"]}] },
            "/path/b": { "filters": [{"operator": "contains", "tags": ["other"]}] }
        });
        let result =
            update_workspaces_map(Some(&existing), "/path/a", FILTERS_SUBKEY, None).unwrap();
        let map = result.expect("non-empty map expected (b remains)");
        assert!(!map.contains_key("/path/a"));
        assert!(map.contains_key("/path/b"));
    }

    #[test]
    fn update_workspaces_returns_none_when_last_workspace_removed() {
        let existing = json!({
            "/path/a": { "filters": [{"operator": "contains", "tags": ["bug"]}] }
        });
        let result =
            update_workspaces_map(Some(&existing), "/path/a", FILTERS_SUBKEY, None).unwrap();
        assert!(
            result.is_none(),
            "expected None to signal deletion of workspaces key"
        );
    }

    #[test]
    fn update_workspaces_returns_none_when_clearing_empty_store() {
        let result = update_workspaces_map(None, "/path/a", FILTERS_SUBKEY, None).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn update_workspaces_errors_on_corrupt_top_level() {
        let existing = json!("not an object");
        let result = update_workspaces_map(
            Some(&existing),
            "/path/a",
            FILTERS_SUBKEY,
            Some(filters_json(&["bug"])),
        );
        assert!(result.is_err());
    }

    #[test]
    fn update_workspaces_errors_on_corrupt_workspace_entry() {
        let existing = json!({ "/path/a": "not an object" });
        let result = update_workspaces_map(
            Some(&existing),
            "/path/a",
            FILTERS_SUBKEY,
            Some(filters_json(&["bug"])),
        );
        assert!(result.is_err());
    }

    #[test]
    fn update_workspaces_preserves_other_workspaces_when_adding() {
        let existing = json!({
            "/path/b": { "filters": [{"operator": "contains", "tags": ["b"]}] }
        });
        let result = update_workspaces_map(
            Some(&existing),
            "/path/a",
            FILTERS_SUBKEY,
            Some(filters_json(&["a"])),
        )
        .unwrap();
        let map = result.expect("non-empty map expected");
        assert!(map.contains_key("/path/a"));
        assert!(map.contains_key("/path/b"));
    }

    #[test]
    fn parse_workspace_history_returns_empty_for_none() {
        assert!(parse_workspace_history(None).is_empty());
    }

    #[test]
    fn parse_workspace_history_parses_array_of_strings() {
        let value = json!(["/a", "/b", "/c"]);
        let parsed = parse_workspace_history(Some(&value));
        assert_eq!(parsed, vec!["/a", "/b", "/c"]);
    }

    #[test]
    fn parse_workspace_history_drops_non_string_entries() {
        let value = json!(["/a", 1, null, "/b", true, {}]);
        let parsed = parse_workspace_history(Some(&value));
        assert_eq!(parsed, vec!["/a", "/b"]);
    }

    #[test]
    fn parse_workspace_history_returns_empty_for_non_array() {
        for v in [json!("not array"), json!({}), json!(42), json!(null)] {
            assert!(
                parse_workspace_history(Some(&v)).is_empty(),
                "expected empty for {v}"
            );
        }
    }

    #[test]
    fn prepend_unique_inserts_into_empty_list() {
        let result = prepend_unique_capped(Vec::new(), "/a".to_string(), 10);
        assert_eq!(result, vec!["/a".to_string()]);
    }

    #[test]
    fn prepend_unique_pushes_new_entry_to_front() {
        let result = prepend_unique_capped(
            vec!["/b".to_string(), "/c".to_string()],
            "/a".to_string(),
            10,
        );
        assert_eq!(
            result,
            vec!["/a".to_string(), "/b".to_string(), "/c".to_string()]
        );
    }

    #[test]
    fn prepend_unique_dedupes_and_moves_existing_entry_to_front() {
        let result = prepend_unique_capped(
            vec!["/b".to_string(), "/a".to_string(), "/c".to_string()],
            "/a".to_string(),
            10,
        );
        assert_eq!(
            result,
            vec!["/a".to_string(), "/b".to_string(), "/c".to_string()]
        );
    }

    #[test]
    fn prepend_unique_is_noop_when_entry_already_at_front() {
        let result = prepend_unique_capped(
            vec!["/a".to_string(), "/b".to_string()],
            "/a".to_string(),
            10,
        );
        assert_eq!(result, vec!["/a".to_string(), "/b".to_string()]);
    }

    #[test]
    fn prepend_unique_truncates_to_cap() {
        let result = prepend_unique_capped(
            vec!["/x".to_string(), "/y".to_string(), "/z".to_string()],
            "/a".to_string(),
            2,
        );
        assert_eq!(result, vec!["/a".to_string(), "/x".to_string()]);
    }

    #[test]
    fn prepend_unique_dedupes_entries_past_the_cap() {
        // Dedup runs before truncation, so an existing entry currently sitting
        // beyond `cap` is still removed before promotion — preventing it
        // from re-appearing alongside the new front entry.
        let result = prepend_unique_capped(
            vec!["/x".to_string(), "/y".to_string(), "/a".to_string()],
            "/a".to_string(),
            2,
        );
        assert_eq!(result, vec!["/a".to_string(), "/x".to_string()]);
    }

    #[test]
    fn prepend_unique_caps_at_one_keeps_only_the_new_entry() {
        let result = prepend_unique_capped(
            vec!["/x".to_string(), "/y".to_string()],
            "/a".to_string(),
            1,
        );
        assert_eq!(result, vec!["/a".to_string()]);
    }

    #[test]
    fn history_to_json_emits_plain_string_array() {
        // Pins the on-disk shape so a future refactor of `history_to_json`
        // can't silently break existing users' settings files.
        let value = history_to_json(&["/a".to_string(), "/b".to_string()]);
        assert_eq!(value, json!(["/a", "/b"]));
    }

    #[test]
    fn history_to_json_roundtrips_through_parse() {
        let original = vec!["/a".to_string(), "/b".to_string(), "/c".to_string()];
        let value = history_to_json(&original);
        let parsed = parse_workspace_history(Some(&value));
        assert_eq!(parsed, original);
    }

    #[test]
    fn update_workspaces_preserves_sibling_settings_in_same_workspace() {
        let existing = json!({
            "/path/a": { "sort_order": "asc", "filters": [{"operator": "contains", "tags": ["old"]}] }
        });
        let result = update_workspaces_map(
            Some(&existing),
            "/path/a",
            FILTERS_SUBKEY,
            Some(filters_json(&["new"])),
        )
        .unwrap();
        let map = result.expect("non-empty map expected");
        let entry = map.get("/path/a").unwrap().as_object().unwrap();
        assert_eq!(entry.get("sort_order"), Some(&json!("asc")));
        assert!(entry.contains_key("filters"));
    }
}
