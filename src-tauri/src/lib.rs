use gray_matter::engine::YAML;
use gray_matter::Matter;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Serialize, Deserialize)]
struct Task {
    id: String,
    title: String,
    status: String,
    body: String,
}

#[derive(Deserialize)]
struct Frontmatter {
    #[serde(default)]
    status: String,
}

struct AppState {
    workspace_dir: Mutex<Option<String>>,
}

#[tauri::command]
fn select_directory(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Option<String> {
    use tauri_plugin_fs::FsExt;
    use tauri_plugin_store::StoreExt;

    let dialog = rfd::FileDialog::new().pick_folder();
    dialog.map(|path| {
        let path_str = path.to_string_lossy().to_string();
        *state.workspace_dir.lock().unwrap() = Some(path_str.clone());
        if let Err(e) = app.fs_scope().allow_directory(&path, false) {
            eprintln!("failed to allow directory in fs scope: {e}");
        }
        if let Ok(store) = app.store("settings.json") {
            store.set("workspace_dir", path_str.clone());
            if let Err(e) = store.save() {
                eprintln!("failed to save store: {e}");
            }
        }
        path_str
    })
}

#[tauri::command]
fn get_workspace_directory(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Option<String> {
    use tauri_plugin_store::StoreExt;

    {
        let guard = state.workspace_dir.lock().unwrap();
        if let Some(dir) = guard.as_ref() {
            return Some(dir.clone());
        }
    }

    if let Ok(store) = app.store("settings.json") {
        if let Some(value) = store.get("workspace_dir") {
            if let Some(dir) = value.as_str() {
                if std::path::Path::new(dir).exists() {
                    *state.workspace_dir.lock().unwrap() = Some(dir.to_string());
                    return Some(dir.to_string());
                }
            }
        }
    }

    None
}

#[tauri::command]
fn list_tasks(state: tauri::State<'_, AppState>) -> Vec<Task> {
    let dir_guard = state.workspace_dir.lock().unwrap();
    let dir = match dir_guard.as_ref() {
        Some(d) => d.clone(),
        None => return vec![],
    };
    drop(dir_guard);

    let path = PathBuf::from(&dir);
    let mut tasks = Vec::new();

    if let Ok(entries) = fs::read_dir(&path) {
        for entry in entries.flatten() {
            let file_path = entry.path();
            if file_path.extension().and_then(|s| s.to_str()) == Some("md") {
                if let Ok(content) = fs::read_to_string(&file_path) {
                    let title = file_path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_string();
                    let (fm, body) = parse_frontmatter(&content);
                    tasks.push(Task {
                        id: file_path.to_string_lossy().to_string(),
                        title,
                        status: fm.map(|f| f.status).unwrap_or_else(|| "todo".to_string()),
                        body,
                    });
                }
            }
        }
    }

    tasks.sort_by(|a, b| a.title.cmp(&b.title));
    tasks
}

#[tauri::command]
fn update_task_status(
    path: String,
    status: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let dir_guard = state.workspace_dir.lock().unwrap();
    let dir = match dir_guard.as_ref() {
        Some(d) => d,
        None => return Err("No directory selected".to_string()),
    };
    let dir_canonical = std::fs::canonicalize(dir).map_err(|e| e.to_string())?;
    let path_canonical = std::fs::canonicalize(&path).map_err(|e| e.to_string())?;
    if !path_canonical.starts_with(&dir_canonical) {
        return Err("Access denied".to_string());
    }
    drop(dir_guard);

    let content = fs::read_to_string(&path_canonical).map_err(|e| e.to_string())?;
    let updated = replace_frontmatter_status(&content, &status);
    fs::write(&path_canonical, updated).map_err(|e| e.to_string())
}

fn parse_frontmatter(content: &str) -> (Option<Frontmatter>, String) {
    let matter = Matter::<YAML>::new();
    match matter.parse::<Frontmatter>(content) {
        Ok(entity) => (entity.data, entity.content),
        Err(_) => (None, content.to_string()),
    }
}

fn replace_frontmatter_status(content: &str, new_status: &str) -> String {
    let matter = Matter::<YAML>::new();
    match matter.parse::<Frontmatter>(content) {
        Ok(entity) => {
            let body = entity
                .content
                .trim_start_matches(['\n', '\r']);
            format!("---\nstatus: {}\n---\n{}", new_status, body)
        }
        Err(_) => {
            format!("---\nstatus: {}\n---\n\n{}", new_status, content)
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState {
            workspace_dir: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            select_directory,
            list_tasks,
            update_task_status,
            get_workspace_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
