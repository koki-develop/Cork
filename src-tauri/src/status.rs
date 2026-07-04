use crate::cork_config;
use crate::error::{CmdResult, CommandError};
use crate::frontmatter;
use crate::security;
use crate::state::AppState;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize)]
pub struct StatusEntry {
    pub label: String,
}

#[derive(Deserialize)]
struct StatusFrontmatter {
    status: Option<String>,
}

#[tauri::command]
pub fn get_statuses(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AppState>,
) -> Option<Vec<StatusEntry>> {
    let dir = state.workspace(window.label())?;
    read_statuses_from_workspace(&dir)
}

#[tauri::command]
pub fn save_statuses(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AppState>,
    statuses: Vec<StatusEntry>,
    rename_map: Option<HashMap<String, String>>,
) -> CmdResult<()> {
    let label = window.label();
    let dir = state.require_workspace(label)?;
    write_statuses_to_workspace(&dir, &statuses)?;

    let Some(rename_map) = rename_map else {
        return Ok(());
    };
    if rename_map.is_empty() {
        return Ok(());
    }

    let dir_canonical = security::canonical_workspace(&dir)?;

    let mut md_files: Vec<PathBuf> = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let file_path = entry.path();
            if file_path.extension().and_then(|s| s.to_str()) != Some("md") {
                continue;
            }
            let path_canonical = security::check_in_workspace(&dir_canonical, &file_path)?;
            md_files.push(path_canonical);
        }
    }

    let renamed: Vec<(PathBuf, String)> = md_files
        .par_iter()
        .filter_map(|path| -> Option<CmdResult<(PathBuf, String)>> {
            let content = match fs::read_to_string(path) {
                Ok(c) => c,
                Err(e) => return Some(Err(e.into())),
            };
            let (fm, _): (Option<StatusFrontmatter>, String) = frontmatter::parse(&content);
            let f = fm?;
            let current_status = f.status?;
            let new_label = rename_map.get(current_status.as_str())?;
            if new_label == &current_status {
                return None;
            }
            let updated =
                frontmatter::update(&content, &[("status", serde_json::json!(new_label))]);
            if let Err(e) = fs::write(path, updated) {
                return Some(Err(e.into()));
            }
            Some(Ok((path.clone(), new_label.clone())))
        })
        .collect::<CmdResult<Vec<_>>>()?;

    // Keep AppState in sync with disk: the cache from before the rename
    // still holds the old status strings, and the reconciliation snapshot
    // would otherwise treat the next genuine external edit on a renamed
    // file as the rename itself, double-counting the change. Pull the new
    // order back out of the snapshot if it exists; new files (not yet
    // observed) just get skipped — the next reconcile will seed them.
    state.invalidate_cache(label);
    let existing = state.get_last_reported(label);
    for (path, new_status) in &renamed {
        let id = path.to_string_lossy().to_string();
        let order = existing.get(&id).and_then(|(_, o)| *o);
        state.upsert_last_reported(label, id, new_status.clone(), order);
    }

    Ok(())
}

pub(crate) fn read_statuses_from_workspace(dir: &Path) -> Option<Vec<StatusEntry>> {
    let value = cork_config::read_cork_config(dir)?;
    Some(
        value
            .get("statuses")
            .and_then(|v| serde_json::from_value::<Vec<StatusEntry>>(v.clone()).ok())
            .unwrap_or_default(),
    )
}

fn write_statuses_to_workspace(dir: &Path, statuses: &[StatusEntry]) -> CmdResult<()> {
    let statuses_value = serde_json::to_value(statuses).map_err(CommandError::other)?;
    cork_config::write_cork_config_key(dir, "statuses", statuses_value)
}
