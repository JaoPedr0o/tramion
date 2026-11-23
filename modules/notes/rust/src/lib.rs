//! Módulo de notas (lado Rust): migrações, acesso aos dados e comandos expostos à interface.
//!
//! O app usa duas coisas daqui: [`MIGRATIONS`] (para abrir o banco) e [`init`] (o plugin do Tauri).

pub mod assets;
mod commands;
pub mod error;
pub mod external;
pub mod model;
pub mod repository;
pub mod service;

use aun_infra_sqlite::{Migration, ModuleMigrations};
use tauri::Runtime;
use tauri::plugin::{Builder, TauriPlugin};

/// As migrações deste módulo. O SQL é embutido no binário em tempo de compilação.
pub const MIGRATIONS: ModuleMigrations = ModuleMigrations {
    module: "notes",
    depends_on: &[],
    migrations: &[
        Migration {
            version: 1,
            sql: include_str!("../migrations/0001_create_notes.sql"),
        },
        Migration {
            version: 2,
            sql: include_str!("../migrations/0002_page_hierarchy.sql"),
        },
        Migration {
            version: 3,
            sql: include_str!("../migrations/0003_page_content.sql"),
        },
    ],
};

/// O plugin do Tauri deste módulo. A interface o chama por `plugin:notes|<comando>`.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("notes")
        .invoke_handler(tauri::generate_handler![
            commands::create,
            commands::get,
            commands::list,
            commands::list_trash,
            commands::update,
            commands::set_pinned,
            commands::move_note,
            commands::delete,
            commands::restore,
            commands::purge,
            commands::save_asset,
            commands::open_external,
        ])
        .build()
}
