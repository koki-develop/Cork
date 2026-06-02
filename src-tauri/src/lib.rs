use gray_matter::engine::YAML;
use gray_matter::Matter;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

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

#[tauri::command]
fn select_directory() -> Option<String> {
    let dialog = rfd::FileDialog::new().pick_folder();
    dialog.map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn list_tasks(dir: String) -> Vec<Task> {
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
fn update_task_status(path: String, status: String) -> Result<(), String> {
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let updated = replace_frontmatter_status(&content, &status);
    fs::write(&path, updated).map_err(|e| e.to_string())
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
        .invoke_handler(tauri::generate_handler![
            select_directory,
            list_tasks,
            update_task_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
