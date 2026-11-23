//! Módulo de notas (lado Rust): migrações, acesso aos dados e comandos expostos à interface.
//!
//! O app usa duas coisas daqui: [`MIGRATIONS`] (para abrir o banco) e [`init`] (o plugin do Tauri).

pub mod assets;
mod commands;
pub mod database;
pub mod database_repository;
pub mod diagnostics;
pub mod duplicate;
pub mod error;
pub mod exports;
pub mod external;
pub mod model;
pub mod repository;
pub mod samples;
pub mod search;
pub mod service;
pub mod templates;

use tauri::Runtime;
use tauri::plugin::{Builder, TauriPlugin};
use tramion_infra_sqlite::{Migration, ModuleMigrations};

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
        Migration {
            version: 4,
            sql: include_str!("../migrations/0004_page_appearance.sql"),
        },
        Migration {
            version: 5,
            sql: include_str!("../migrations/0005_databases.sql"),
        },
        Migration {
            version: 6,
            sql: include_str!("../migrations/0006_rename_app_data_paths.sql"),
        },
        Migration {
            version: 7,
            sql: include_str!("../migrations/0007_rename_app_data_paths_tramion.sql"),
        },
        Migration {
            version: 8,
            sql: include_str!("../migrations/0008_notes_meta.sql"),
        },
        Migration {
            version: 9,
            sql: include_str!("../migrations/0009_database_views.sql"),
        },
        Migration {
            version: 10,
            sql: include_str!("../migrations/0010_reminders.sql"),
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
            commands::empty_trash,
            commands::search,
            commands::add_view,
            commands::update_view,
            commands::delete_view,
            commands::duplicate_note,
            commands::list_templates,
            commands::create_from_template,
            commands::save_markdown,
            commands::set_reminders,
            commands::due_tasks,
            commands::save_asset,
            commands::set_appearance,
            commands::report_error,
            commands::open_external,
            commands::create_database,
            commands::get_database,
            commands::add_property,
            commands::update_property,
            commands::delete_property,
            commands::create_row,
            commands::set_cell,
            commands::rename_note,
        ])
        .build()
}
