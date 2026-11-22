// Ponto de entrada do backend nativo (Rust) e "composition root" do lado Rust:
// é aqui, e só aqui, que os módulos são ligados ao app.
use aun_infra_sqlite::{Database, OpenOptions, SharedDatabase};
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Cada módulo entra como plugin: traz seus próprios comandos e permissões.
        .plugin(aun_notes::init())
        .setup(|app| {
            // Os dados ficam na pasta de dados do app (no Linux, ~/.local/share/<identifier>),
            // nunca na pasta do projeto.
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            // O banco é aberto UMA vez, com as migrações de todos os módulos.
            let migrations = [aun_notes::MIGRATIONS];
            let options = OpenOptions {
                backup_dir: Some(data_dir.join("backups")),
                backups_to_keep: 5,
            };
            let db = Database::open(
                &data_dir.join("aesthetic-ugly-notes.db"),
                &migrations,
                &options,
            )?;

            app.manage::<SharedDatabase>(Mutex::new(db));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao executar o aplicativo Tauri");
}
