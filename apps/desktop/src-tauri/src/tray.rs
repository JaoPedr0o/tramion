//! Ícone na bandeja do sistema: com ele, fechar a janela só a esconde e o Tramion continua rodando (os lembretes de
//! tarefas seguem funcionando). É "melhor esforço": se o sistema não oferecer bandeja, nada disso é ativado e fechar a
//! janela fecha o aplicativo normalmente, para a pessoa nunca ficar com um app invisível e sem como abri-lo.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

/// Evento que a janela escuta para abrir a "Captura rápida".
pub const QUICK_CAPTURE_EVENT: &str = "tramion://quick-capture";

/// Guardado no estado do app: `true` se a bandeja foi criada (então fechar a janela só esconde).
pub struct TrayActive(pub bool);

/// Mostra a janela principal (trazendo-a de volta se estava escondida ou minimizada).
pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Fechar a janela deve escondê-la (em vez de fechar o app)? Só se a bandeja existe.
pub fn hide_instead_of_close(tray_active: bool) -> bool {
    tray_active
}

/// Cria o ícone da bandeja com o menu: Abrir, Captura rápida e Sair.
pub fn build(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Abrir o Tramion", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", "Captura rápida", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &capture, &quit])?;

    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Tramion")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "capture" => {
                show_main_window(app);
                let _ = app.emit(QUICK_CAPTURE_EVENT, ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}
