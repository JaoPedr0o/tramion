// Ponto de entrada do backend nativo (Rust) e "composition root" do lado Rust:
// é aqui, e só aqui, que os módulos são ligados ao app.
pub mod legacy;
pub mod tray;

use std::sync::Mutex;
use tauri::{Manager, WindowEvent};
use tramion_infra_sqlite::{Database, OpenOptions, SharedDatabase};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Uma segunda abertura não cria outro aplicativo (dois processos no mesmo banco): traz a janela de volta.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main_window(app);
        }))
        // Cada módulo entra como plugin: traz seus próprios comandos e permissões.
        .plugin(tauri_plugin_notification::init())
        .plugin(tramion_notes::init())
        .setup(|app| {
            // Os dados ficam na pasta de dados do app (no Linux, ~/.local/share/<identifier>),
            // nunca na pasta do projeto.
            let data_dir = app.path().app_data_dir()?;

            // Quem usava um nome antigo do app tem os dados na pasta daquele nome: move para a nova.
            match legacy::migrate_from_any_legacy(&data_dir) {
                Ok(Some(from)) => {
                    eprintln!("[dados] pasta `{from}` movida para {}", data_dir.display())
                }
                Ok(None) => {}
                Err(error) => eprintln!("[dados] não foi possível mover os dados antigos: {error}"),
            }
            std::fs::create_dir_all(&data_dir)?;

            // O banco é aberto UMA vez, com as migrações de todos os módulos.
            let migrations = [tramion_notes::MIGRATIONS];
            let options = OpenOptions {
                backup_dir: Some(data_dir.join("backups")),
                backups_to_keep: 5,
            };
            let db = Database::open(&data_dir.join(legacy::CURRENT_DB), &migrations, &options)?;

            // Primeira abertura com o banco vazio: cria as páginas de exemplo (uma única vez).
            match tramion_notes::samples::seed_if_first_run(db.connection()) {
                Ok(true) => eprintln!("[exemplos] páginas de exemplo criadas"),
                Ok(false) => {}
                Err(error) => {
                    eprintln!("[exemplos] não foi possível criar as páginas de exemplo: {error}")
                }
            }

            app.manage::<SharedDatabase>(Mutex::new(db));

            // Já há aparelhos pareados: o servidor de sincronização sobe junto com o app.
            tramion_notes::sync_server::start_if_paired(app.handle());

            // Bandeja do sistema (melhor esforço): com ela, fechar a janela só a esconde.
            let tray_ok = match tray::build(app) {
                Ok(()) => true,
                Err(error) => {
                    eprintln!("[bandeja] indisponível, fechar a janela fecha o app: {error}");
                    false
                }
            };
            app.manage(tray::TrayActive(tray_ok));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let active = window
                    .app_handle()
                    .try_state::<tray::TrayActive>()
                    .is_some_and(|state| tray::hide_instead_of_close(state.0));
                if active {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("erro ao executar o aplicativo Tauri");
}
