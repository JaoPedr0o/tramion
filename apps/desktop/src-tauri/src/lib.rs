// Ponto de entrada do backend nativo (Rust) e "composition root" do lado Rust:
// é aqui, e só aqui, que os módulos são ligados ao app.
pub mod legacy;

use aesthetic_infra_sqlite::{Database, OpenOptions, SharedDatabase};
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Cada módulo entra como plugin: traz seus próprios comandos e permissões.
        .plugin(aesthetic_notes::init())
        .setup(|app| {
            // Os dados ficam na pasta de dados do app (no Linux, ~/.local/share/<identifier>),
            // nunca na pasta do projeto.
            let data_dir = app.path().app_data_dir()?;

            // Quem usava o nome antigo ("Aesthetic Ugly Notes") tem os dados na pasta `dev.aun.notes`: move para a nova.
            if let Some(parent) = data_dir.parent() {
                match legacy::migrate_legacy_data(&data_dir, &parent.join("dev.aun.notes")) {
                    Ok(true) => eprintln!(
                        "[dados] pasta do nome antigo movida para {}",
                        data_dir.display()
                    ),
                    Ok(false) => {}
                    Err(error) => {
                        eprintln!("[dados] não foi possível mover os dados antigos: {error}")
                    }
                }
            }
            std::fs::create_dir_all(&data_dir)?;

            // O banco é aberto UMA vez, com as migrações de todos os módulos.
            let migrations = [aesthetic_notes::MIGRATIONS];
            let options = OpenOptions {
                backup_dir: Some(data_dir.join("backups")),
                backups_to_keep: 5,
            };
            let db = Database::open(&data_dir.join(legacy::CURRENT_DB), &migrations, &options)?;

            app.manage::<SharedDatabase>(Mutex::new(db));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao executar o aplicativo Tauri");
}
