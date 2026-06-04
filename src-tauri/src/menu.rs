use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{App, Emitter};

pub fn setup(app: &mut App) -> tauri::Result<()> {
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
}
