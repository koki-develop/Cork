use crate::error::{CmdResult, CommandError};
use crate::frontmatter;
use crate::security;
use crate::state::AppState;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::BufRead;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub status: String,
    pub body: String,
    #[serde(default)]
    pub order: Option<f64>,
}

#[derive(Deserialize)]
struct TaskFrontmatter {
    status: Option<String>,
    #[serde(default)]
    order: Option<f64>,
}

#[tauri::command]
pub fn list_tasks(state: tauri::State<'_, AppState>) -> Vec<Task> {
    let Some(dir) = state.workspace() else {
        return Vec::new();
    };

    let md_files: Vec<PathBuf> = fs::read_dir(&dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("md"))
                .collect()
        })
        .unwrap_or_default();

    let mut tasks: Vec<Task> = md_files
        .par_iter()
        .filter_map(|file_path| {
            let content = read_task_preview(file_path)?;
            let title = file_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            let (fm, body) = frontmatter::parse::<TaskFrontmatter>(&content);
            let f = fm?;
            let status = f.status.filter(|s| !s.is_empty())?;
            Some(Task {
                id: file_path.to_string_lossy().to_string(),
                title,
                status,
                body,
                order: f.order,
            })
        })
        .collect();

    tasks.sort_by(|a, b| {
        let a_order = a.order.unwrap_or(f64::MAX);
        let b_order = b.order.unwrap_or(f64::MAX);
        a_order
            .partial_cmp(&b_order)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.title.cmp(&b.title))
    });
    tasks
}

#[tauri::command]
pub fn get_task(path: String, state: tauri::State<'_, AppState>) -> CmdResult<Task> {
    let dir = state.require_workspace()?;
    let path = security::ensure_in_workspace(&dir, Path::new(&path))?;

    let content = fs::read_to_string(&path)?;
    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    let (fm, body) = frontmatter::parse::<TaskFrontmatter>(&content);
    let f = fm.ok_or(CommandError::MissingFrontmatter)?;
    let status = f.status.unwrap_or_default();
    Ok(Task {
        id: path.to_string_lossy().to_string(),
        title,
        status,
        body,
        order: f.order,
    })
}

#[tauri::command]
pub fn create_task(
    title: String,
    status: String,
    body: Option<String>,
    order: Option<f64>,
    state: tauri::State<'_, AppState>,
) -> CmdResult<Task> {
    let dir = state.require_workspace()?;
    let dir_canonical = security::canonical_workspace(&dir)?;

    let title = sanitize_title(&title)?;

    let file_path = dir_canonical.join(format!("{}.md", title));
    if file_path.exists() {
        return Err(CommandError::DuplicateTask);
    }

    let body = body.unwrap_or_default();
    let mut fm_value = serde_json::json!({ "status": status });
    if let Some(o) = order {
        if let Some(obj) = fm_value.as_object_mut() {
            obj.insert("order".to_string(), serde_json::json!(o));
        }
    }
    let yaml = frontmatter::serialize(&fm_value);
    let content = format!("---\n{}---\n\n{}", yaml, body);
    fs::write(&file_path, content)?;

    Ok(Task {
        id: file_path.to_string_lossy().to_string(),
        title,
        status,
        body,
        order,
    })
}

#[tauri::command]
pub fn update_task(
    path: String,
    title: Option<String>,
    status: Option<String>,
    body: Option<String>,
    order: Option<f64>,
    state: tauri::State<'_, AppState>,
) -> CmdResult<Task> {
    let dir = state.require_workspace()?;
    let dir_canonical = security::canonical_workspace(&dir)?;
    let path_canonical = security::check_in_workspace(&dir_canonical, Path::new(&path))?;

    let content = fs::read_to_string(&path_canonical)?;
    let (fm, current_body): (Option<TaskFrontmatter>, String) = frontmatter::parse(&content);

    let body_provided = body.is_some();
    let new_body = body.unwrap_or(current_body);

    let current_status = fm.as_ref().and_then(|f| f.status.as_deref()).unwrap_or("");
    let new_status = status.unwrap_or_else(|| current_status.to_string());
    let current_order = order.or_else(|| fm.as_ref().and_then(|f| f.order));
    let current_title = path_canonical
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    let (new_title, title_changed) = match title {
        Some(t) => {
            let sanitized = sanitize_title(&t)?;
            let changed = sanitized != current_title;
            (sanitized, changed)
        }
        None => (current_title, false),
    };

    let mut fm_updates: Vec<(&str, serde_json::Value)> =
        vec![("status", serde_json::json!(new_status))];
    if let Some(o) = current_order {
        fm_updates.push(("order", serde_json::json!(o)));
    }
    let new_content = if body_provided {
        let with_updates = frontmatter::update(&content, &fm_updates);
        let marker = "\n---\n";
        match with_updates.find(marker) {
            Some(pos) => format!("{}{}", &with_updates[..pos + marker.len()], new_body),
            None => format!("---\n---\n{}", new_body),
        }
    } else {
        frontmatter::update(&content, &fm_updates)
    };

    let target_path = if title_changed {
        let new_path = dir_canonical.join(format!("{}.md", new_title));
        if new_path.exists() && new_path != path_canonical {
            return Err(CommandError::DuplicateTask);
        }
        fs::write(&new_path, &new_content)?;
        if new_path != path_canonical {
            fs::remove_file(&path_canonical)?;
        }
        new_path
    } else {
        fs::write(&path_canonical, &new_content)?;
        path_canonical
    };

    Ok(Task {
        id: target_path.to_string_lossy().to_string(),
        title: new_title,
        status: new_status,
        body: new_body,
        order: current_order,
    })
}

#[tauri::command]
pub fn update_task_status(
    path: String,
    status: String,
    state: tauri::State<'_, AppState>,
) -> CmdResult<()> {
    let dir = state.require_workspace()?;
    let path = security::ensure_in_workspace(&dir, Path::new(&path))?;
    let content = fs::read_to_string(&path)?;
    let updated = frontmatter::update(&content, &[("status", serde_json::json!(status))]);
    fs::write(&path, updated)?;
    Ok(())
}

#[tauri::command]
pub fn update_task_order(
    path: String,
    order: f64,
    state: tauri::State<'_, AppState>,
) -> CmdResult<()> {
    let dir = state.require_workspace()?;
    let path = security::ensure_in_workspace(&dir, Path::new(&path))?;
    let content = fs::read_to_string(&path)?;
    let updated = frontmatter::update(&content, &[("order", serde_json::json!(order))]);
    fs::write(&path, updated)?;
    Ok(())
}

#[tauri::command]
pub fn delete_task(path: String, state: tauri::State<'_, AppState>) -> CmdResult<()> {
    let dir = state.require_workspace()?;
    let path = security::ensure_in_workspace(&dir, Path::new(&path))?;
    fs::remove_file(&path)?;
    Ok(())
}

#[tauri::command]
pub fn renumber_tasks(
    paths: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> CmdResult<()> {
    let dir = state.require_workspace()?;
    let dir_canonical = security::canonical_workspace(&dir)?;
    for (i, path) in paths.iter().enumerate() {
        let path_canonical = security::check_in_workspace(&dir_canonical, Path::new(path))?;
        let content = fs::read_to_string(&path_canonical)?;
        let updated = frontmatter::update(&content, &[("order", serde_json::json!(i as f64))]);
        fs::write(&path_canonical, updated)?;
    }
    Ok(())
}

fn sanitize_title(title: &str) -> CmdResult<String> {
    let sanitized: String = title
        .chars()
        .map(|c| if c == '/' { '-' } else { c })
        .filter(|&c| c != '\0')
        .collect();
    let trimmed = sanitized.trim().to_string();
    if trimmed.is_empty() {
        return Err(CommandError::EmptyTitle);
    }
    Ok(trimmed)
}

/// Reads only frontmatter + up to 2 non-empty body lines from a file.
/// Returns None if the file does not start with "---" (no frontmatter).
fn read_task_preview(file_path: &Path) -> Option<String> {
    let file = fs::File::open(file_path).ok()?;
    let reader = std::io::BufReader::new(file);
    let mut lines = reader.lines();

    let first = lines.next()?.ok()?;
    if first.trim_end() != "---" {
        return None;
    }

    let mut fm_lines: Vec<String> = Vec::new();
    loop {
        let line = lines.next()?.ok()?;
        if line.trim_end() == "---" {
            break;
        }
        fm_lines.push(line);
    }

    let mut body_lines: Vec<String> = Vec::new();
    let mut non_empty = 0u32;
    for line in lines {
        let Ok(line) = line else { break };
        if !line.trim().is_empty() {
            non_empty += 1;
        }
        body_lines.push(line);
        if non_empty >= 2 {
            break;
        }
    }

    Some(format!(
        "---\n{}\n---\n{}",
        fm_lines.join("\n"),
        body_lines.join("\n")
    ))
}
