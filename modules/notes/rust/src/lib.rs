//! Módulo de notas (lado Rust): migrações, acesso aos dados e comandos expostos à interface.
//!
//! O app usa duas coisas daqui: [`MIGRATIONS`] (para abrir o banco) e [`init`] (o plugin do Tauri).

mod commands;
pub mod model;
pub mod repository;

use aun_infra_sqlite::{Migration, ModuleMigrations};
use tauri::Runtime;
use tauri::plugin::{Builder, TauriPlugin};

/// As migrações deste módulo. O SQL é embutido no binário em tempo de compilação.
pub const MIGRATIONS: ModuleMigrations = ModuleMigrations {
    module: "notes",
    depends_on: &[],
    migrations: &[Migration {
        version: 1,
        sql: include_str!("../migrations/0001_create_notes.sql"),
    }],
};

/// O plugin do Tauri deste módulo. A interface o chama por `plugin:notes|<comando>`.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("notes")
        .invoke_handler(tauri::generate_handler![commands::list])
        .build()
}
