use crate::cork_config;
use crate::error::CmdResult;
use crate::state::AppState;
use std::path::Path;

pub(crate) fn read_workspace_name_from_workspace(dir: &Path) -> String {
    cork_config::read_cork_config(dir)
        .and_then(|root| {
            root.get("name")
                .and_then(|v| v.as_str())
                .map(str::to_string)
        })
        .unwrap_or_default()
}

fn write_workspace_name_to_workspace(dir: &Path, name: &str) -> CmdResult<()> {
    cork_config::write_cork_config_key(dir, "name", serde_json::json!(name))
}

/// Empty string means unnamed — this covers both a `.cork.json` with no
/// `name` key (older files, or one that's never had a name set) and an
/// explicit empty value, so the frontend doesn't need to distinguish them.
#[tauri::command]
pub fn get_workspace_name(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AppState>,
) -> Option<String> {
    let dir = state.workspace(window.label())?;
    Some(read_workspace_name_from_workspace(&dir))
}

#[tauri::command]
pub fn set_workspace_name(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AppState>,
    name: String,
) -> CmdResult<()> {
    let dir = state.require_workspace(window.label())?;
    write_workspace_name_to_workspace(&dir, &name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn read_workspace_name_missing_file_returns_empty() {
        let dir = tempdir().unwrap();
        assert_eq!(read_workspace_name_from_workspace(dir.path()), "");
    }

    #[test]
    fn read_workspace_name_missing_key_returns_empty() {
        let dir = tempdir().unwrap();
        fs::write(
            cork_config::cork_config_path(dir.path()),
            r#"{"statuses":[]}"#,
        )
        .unwrap();
        assert_eq!(read_workspace_name_from_workspace(dir.path()), "");
    }

    #[test]
    fn read_workspace_name_non_string_value_returns_empty() {
        let dir = tempdir().unwrap();
        fs::write(cork_config::cork_config_path(dir.path()), r#"{"name":42}"#).unwrap();
        assert_eq!(read_workspace_name_from_workspace(dir.path()), "");
    }

    #[test]
    fn write_then_read_round_trips() {
        let dir = tempdir().unwrap();
        write_workspace_name_to_workspace(dir.path(), "My Workspace").unwrap();
        assert_eq!(
            read_workspace_name_from_workspace(dir.path()),
            "My Workspace"
        );
    }

    #[test]
    fn write_preserves_other_keys() {
        let dir = tempdir().unwrap();
        fs::write(
            cork_config::cork_config_path(dir.path()),
            r#"{"statuses":[{"label":"Todo"}]}"#,
        )
        .unwrap();
        write_workspace_name_to_workspace(dir.path(), "My Workspace").unwrap();
        let root = cork_config::read_cork_config(dir.path()).unwrap();
        assert!(root.get("statuses").is_some());
    }
}
