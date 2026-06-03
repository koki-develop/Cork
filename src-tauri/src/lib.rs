use gray_matter::engine::YAML;
use gray_matter::Matter;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;

#[derive(Serialize, Deserialize)]
struct Task {
    id: String,
    title: String,
    status: String,
    body: String,
    #[serde(default)]
    order: Option<f64>,
}

#[derive(Serialize, Deserialize)]
struct StatusEntry {
    label: String,
}

#[derive(Deserialize)]
struct Frontmatter {
    #[serde(default)]
    status: String,
    #[serde(default)]
    order: Option<f64>,
}

struct AppState {
    workspace_dir: Mutex<Option<String>>,
}

#[tauri::command]
fn pick_directory() -> Option<String> {
    rfd::FileDialog::new()
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn set_workspace_directory(
    path: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri_plugin_fs::FsExt;
    use tauri_plugin_store::StoreExt;

    *state.workspace_dir.lock().unwrap() = Some(path.clone());
    app.fs_scope()
        .allow_directory(Path::new(&path), false)
        .map_err(|e| e.to_string())?;
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("workspace_dir", path);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_workspace_directory(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Option<String> {
    use tauri_plugin_fs::FsExt;
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
                if Path::new(dir).exists() {
                    *state.workspace_dir.lock().unwrap() = Some(dir.to_string());
                    if let Err(e) = app.fs_scope().allow_directory(Path::new(dir), false) {
                        eprintln!("failed to allow directory in fs scope: {e}");
                    }
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

    let default_status = read_statuses_from_workspace(&dir)
        .first()
        .map(|s| s.label.clone())
        .unwrap_or_default();

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
                        status: fm
                            .as_ref()
                            .map(|f| f.status.clone())
                            .unwrap_or_else(|| default_status.clone()),
                        body,
                        order: fm.and_then(|f| f.order),
                    });
                }
            }
        }
    }

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
    let updated = update_frontmatter(&content, &[("status", serde_json::json!(status))]);
    fs::write(&path_canonical, updated).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_task_order(
    path: String,
    order: f64,
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
    let updated = update_frontmatter(&content, &[("order", serde_json::json!(order))]);
    fs::write(&path_canonical, updated).map_err(|e| e.to_string())
}

#[tauri::command]
fn renumber_tasks(
    paths: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let dir_guard = state.workspace_dir.lock().unwrap();
    let dir = match dir_guard.as_ref() {
        Some(d) => d,
        None => return Err("No directory selected".to_string()),
    };
    let dir_canonical = std::fs::canonicalize(dir).map_err(|e| e.to_string())?;
    for (i, path) in paths.iter().enumerate() {
        let path_canonical = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
        if !path_canonical.starts_with(&dir_canonical) {
            return Err("Access denied".to_string());
        }
        let content = fs::read_to_string(&path_canonical).map_err(|e| e.to_string())?;
        let updated =
            update_frontmatter(&content, &[("order", serde_json::json!(i as f64))]);
        fs::write(&path_canonical, updated).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn parse_frontmatter(content: &str) -> (Option<Frontmatter>, String) {
    let matter = Matter::<YAML>::new();
    match matter.parse::<Frontmatter>(content) {
        Ok(entity) => (entity.data, entity.content),
        Err(_) => (None, content.to_string()),
    }
}

fn update_frontmatter(content: &str, updates: &[(&str, serde_json::Value)]) -> String {
    let matter = Matter::<YAML>::new();
    match matter.parse::<serde_json::Value>(content) {
        Ok(entity) => {
            let body = entity.content.trim_start_matches(['\n', '\r']);
            let mut data = entity.data.unwrap_or(serde_json::json!({}));
            if let Some(obj) = data.as_object_mut() {
                for (key, value) in updates {
                    obj.insert(key.to_string(), value.clone());
                }
            }
            let yaml = serde_yaml::to_string(&data).unwrap_or_default();
            format!("---\n{}---\n{}", yaml, body)
        }
        Err(_) => {
            let mut fm = String::from("---\n");
            for (key, value) in updates {
                fm.push_str(&format!("{}: {}\n", key, value));
            }
            fm.push_str("---\n\n");
            fm.push_str(content);
            fm
        }
    }
}

#[tauri::command]
fn get_statuses(state: tauri::State<'_, AppState>) -> Vec<StatusEntry> {
    let dir = match state.workspace_dir.lock().unwrap().clone() {
        Some(d) => d,
        None => return vec![],
    };
    read_statuses_from_workspace(&dir)
}

#[tauri::command]
fn save_statuses(
    state: tauri::State<'_, AppState>,
    statuses: Vec<StatusEntry>,
) -> Result<(), String> {
    let dir = match state.workspace_dir.lock().unwrap().clone() {
        Some(d) => d,
        None => return Err("No directory selected".to_string()),
    };
    write_statuses_to_workspace(&dir, &statuses)
}

fn cork_config_path(dir: &str) -> PathBuf {
    Path::new(dir).join(".cork.json")
}

fn read_statuses_from_workspace(dir: &str) -> Vec<StatusEntry> {
    let path = cork_config_path(dir);
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    let value: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            eprintln!(
                "failed to parse {}: {e}",
                path.display()
            );
            return vec![];
        }
    };
    value
        .get("statuses")
        .and_then(|v| serde_json::from_value::<Vec<StatusEntry>>(v.clone()).ok())
        .unwrap_or_default()
}

fn write_statuses_to_workspace(dir: &str, statuses: &[StatusEntry]) -> Result<(), String> {
    let path = cork_config_path(dir);
    let mut root = fs::read_to_string(&path)
        .ok()
        .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
        .filter(|v| v.is_object())
        .unwrap_or_else(|| serde_json::json!({}));
    let statuses_value = serde_json::to_value(statuses).map_err(|e| e.to_string())?;
    if let Some(obj) = root.as_object_mut() {
        obj.insert("statuses".to_string(), statuses_value);
    }
    let mut serialized = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    serialized.push('\n');
    fs::write(&path, serialized).map_err(|e| e.to_string())
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
            pick_directory,
            set_workspace_directory,
            list_tasks,
            update_task_status,
            update_task_order,
            renumber_tasks,
            get_workspace_directory,
            get_statuses,
            save_statuses,
        ])
        .setup(|app| {
            let settings_item = MenuItemBuilder::with_id("settings", "Settings...")
                .accelerator("CmdOrCtrl+,")
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

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let window_menu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .separator()
                .close_window()
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&app_menu, &edit_menu, &window_menu])
                .build()?;

            app.set_menu(menu)?;

            app.on_menu_event(|app, event| {
                if event.id().0.as_str() == "settings" {
                    let _ = app.emit("menu:open-settings", ());
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
