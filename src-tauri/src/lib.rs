mod error;
mod frontmatter;
mod menu;
mod security;
mod state;
mod status;
mod task;
mod workspace;

use state::AppState;
use tauri::{TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

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
            let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("")
                .inner_size(1280.0, 800.0);

            #[cfg(target_os = "macos")]
            let win_builder = win_builder
                .title_bar_style(TitleBarStyle::Overlay)
                .traffic_light_position(tauri::LogicalPosition::new(20.0, 28.0));

            let _window = win_builder.build()?;

            #[cfg(target_os = "macos")]
            {
                use objc2_app_kit::{NSColor, NSWindow};

                let ns_window_ptr = _window.ns_window().unwrap() as *mut NSWindow;
                let ns_window = unsafe { &*ns_window_ptr };
                let bg_color = NSColor::colorWithRed_green_blue_alpha(
                    2.0 / 255.0,
                    6.0 / 255.0,
                    23.0 / 255.0,
                    1.0,
                );
                ns_window.setBackgroundColor(Some(&bg_color));
            }

            menu::setup(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
