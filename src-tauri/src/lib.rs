mod error;
mod frontmatter;
mod menu;
mod security;
mod state;
mod status;
mod task;
mod workspace;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            workspace::pick_directory,
            workspace::set_workspace_directory,
            workspace::get_workspace_directory,
            task::list_tasks,
            task::create_task,
            task::update_task,
            task::update_task_status,
            task::update_task_order,
            task::renumber_tasks,
            task::delete_task,
            task::get_task,
            status::get_statuses,
            status::save_statuses,
        ])
        .setup(|app| {
            menu::setup(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
