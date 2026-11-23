// Ponto de entrada do backend nativo (Rust) e "composition root" do lado Rust:
// é aqui, e só aqui, que os módulos são ligados ao app.
pub mod legacy;

use std::sync::Mutex;
use tauri::Manager;
use tramion_infra_sqlite::{Database, OpenOptions, SharedDatabase};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao executar o aplicativo Tauri");
}
