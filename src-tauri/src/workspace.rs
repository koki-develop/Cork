use crate::error::{CmdResult, CommandError};
use crate::state::AppState;
use crate::task::TagFilter;
use std::path::PathBuf;
use tauri_plugin_fs::FsExt;
use tauri_plugin_store::StoreExt;

const SETTINGS_FILE: &str = "settings.json";
const WORKSPACE_KEY: &str = "workspace_dir";

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
    path: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> CmdResult<()> {
    let dir = PathBuf::from(&path);
    state.set_workspace(dir.clone());
    app.fs_scope()
        .allow_directory(&dir, false)
        .map_err(CommandError::other)?;
    let store = app.store(SETTINGS_FILE).map_err(CommandError::other)?;
    store.set(WORKSPACE_KEY, path);
    store.save().map_err(CommandError::other)?;
    Ok(())
}

#[tauri::command]
pub fn get_workspace_directory(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Option<String> {
    if let Some(dir) = state.workspace() {
        return Some(dir.to_string_lossy().to_string());
    }

    let stored = read_stored_workspace(&app)?;
    if !stored.exists() {
        return None;
    }

    state.set_workspace(stored.clone());
    if let Err(e) = app.fs_scope().allow_directory(&stored, false) {
        eprintln!("failed to allow directory in fs scope: {e}");
    }
    Some(stored.to_string_lossy().to_string())
}

fn read_stored_workspace(app: &tauri::AppHandle) -> Option<PathBuf> {
    let store = app.store(SETTINGS_FILE).ok()?;
    let value = store.get(WORKSPACE_KEY)?;
    let dir = value.as_str()?;
    Some(PathBuf::from(dir))
}

#[tauri::command]
pub fn get_workspace_filters(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> CmdResult<Vec<StoredFilter>> {
    let dir = state.require_workspace()?;
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
    let workspace = workspace_entry.as_object().ok_or_else(|| {
        CommandError::other(format!("`workspaces.{}` is corrupted", key))
    })?;
    let Some(filters_value) = workspace.get(FILTERS_SUBKEY) else {
        return Ok(Vec::new());
    };
    serde_json::from_value::<Vec<StoredFilter>>(filters_value.clone())
        .map_err(CommandError::other)
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
    filters: Vec<StoredFilter>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> CmdResult<()> {
    let dir = state.require_workspace()?;
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

    fn filters_json(tags: &[&str]) -> serde_json::Value {
        json!([{"operator": "contains", "tags": tags}])
    }

    #[test]
    fn update_workspaces_inserts_into_empty_store() {
        let value = filters_json(&["bug"]);
        let result =
            update_workspaces_map(None, "/path/a", FILTERS_SUBKEY, Some(value)).unwrap();
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
        assert!(result.is_none(), "expected None to signal deletion of workspaces key");
    }

    #[test]
    fn update_workspaces_returns_none_when_clearing_empty_store() {
        let result =
            update_workspaces_map(None, "/path/a", FILTERS_SUBKEY, None).unwrap();
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
