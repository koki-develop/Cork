use crate::error::{CmdResult, CommandError};
use crate::state::AppState;
use std::path::PathBuf;
use tauri_plugin_fs::FsExt;
use tauri_plugin_store::StoreExt;

const SETTINGS_FILE: &str = "settings.json";
const WORKSPACE_KEY: &str = "workspace_dir";

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
