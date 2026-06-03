use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

/// Set the dock (macOS) / taskbar (Windows) unread badge. Called from the web
/// app via `window.__TAURI__.core.invoke("set_unread", { count })`.
#[tauri::command]
fn set_unread(window: tauri::WebviewWindow, count: u32) {
    let _ = window.set_badge_count(if count > 0 { Some(count as i64) } else { None });
}

/// Reveal + focus the main window (from the tray "Open" item or a tray click).
fn focus_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Check GitHub Releases for an update. If one exists, prompt; on confirm,
/// download + install + relaunch. `notify_when_current` controls whether the
/// "you're up to date" dialog shows (true for the manual tray check, false for
/// the silent on-launch check). Never blocks; errors are swallowed.
#[cfg(desktop)]
fn check_for_updates(app: tauri::AppHandle, notify_when_current: bool) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    use tauri_plugin_updater::UpdaterExt;

    tauri::async_runtime::spawn(async move {
        let updater = match app.updater() {
            Ok(u) => u,
            Err(_) => return,
        };
        match updater.check().await {
            Ok(Some(update)) => {
                let version = update.version.clone();
                let app_for_install = app.clone();
                app.dialog()
                    .message(format!("Version {version} is available. Update now?"))
                    .title("Update available")
                    .buttons(MessageDialogButtons::OkCancelCustom(
                        "Update".to_string(),
                        "Later".to_string(),
                    ))
                    .show(move |confirmed| {
                        if confirmed {
                            tauri::async_runtime::spawn(async move {
                                if update
                                    .download_and_install(|_chunk, _total| {}, || {})
                                    .await
                                    .is_ok()
                                {
                                    app_for_install.restart();
                                }
                            });
                        }
                    });
            }
            Ok(None) => {
                if notify_when_current {
                    app.dialog()
                        .message("You're running the latest version.")
                        .title("No updates")
                        .kind(MessageDialogKind::Info)
                        .show(|_| {});
                }
            }
            Err(_) => {
                // Network / signature error — ignore silently on launch.
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_notification::init());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_window_state::Builder::default().build())
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .invoke_handler(tauri::generate_handler![set_unread])
        .setup(|app| {
            // ---- System tray ----
            let open_i = MenuItem::with_id(app, "open", "Open Xyra Chat", true, None::<&str>)?;
            let updates_i = MenuItem::with_id(
                app,
                "check-updates",
                "Check for Updates…",
                true,
                None::<&str>,
            )?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &updates_i, &quit_i])?;

            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Xyra Chat")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => focus_main(app),
                    "check-updates" => {
                        #[cfg(desktop)]
                        check_for_updates(app.clone(), true);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Double-click (Windows) reveals the window; macOS/Linux use
                    // the "Open" menu item.
                    if let TrayIconEvent::DoubleClick { .. } = event {
                        focus_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // ---- Silent update check on launch ----
            #[cfg(desktop)]
            check_for_updates(app.handle().clone(), false);

            Ok(())
        })
        .on_window_event(|window, event| {
            // Close to tray instead of quitting.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Xyra Chat");
}
