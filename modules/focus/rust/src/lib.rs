//! Módulo Foco (lado Rust): pomodoro e hábitos. Migrações, acesso aos dados e comandos da interface.
//!
//! O app usa duas coisas daqui: [`MIGRATIONS`] (para abrir o banco) e [`init`] (o plugin do Tauri).
//! Este crate NÃO depende do módulo de notas: a página associada a uma sessão é só um id de texto.

mod commands;
pub mod error;
pub mod habits;
pub mod sessions;
pub mod settings;
pub mod timer;

use tauri::Runtime;
use tauri::plugin::{Builder, TauriPlugin};
use tramion_infra_sqlite::{Migration, ModuleMigrations};

/// As migrações deste módulo (versões próprias, independentes das de outros módulos).
pub const MIGRATIONS: ModuleMigrations = ModuleMigrations {
    module: "focus",
    depends_on: &[],
    migrations: &[
        Migration {
            version: 1,
            sql: include_str!("../migrations/0001_focus.sql"),
        },
        Migration {
            version: 2,
            sql: include_str!("../migrations/0002_focus_timer.sql"),
        },
    ],
};

/// O plugin do Tauri deste módulo. A interface o chama por `plugin:focus|<comando>`.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("focus")
        .invoke_handler(tauri::generate_handler![
            commands::habit_list,
            commands::habit_create,
            commands::habit_update,
            commands::habit_archive,
            commands::habit_checks,
            commands::habit_set_check,
            commands::session_record,
            commands::session_list,
            commands::settings_get,
            commands::settings_set,
            commands::timer_get,
            commands::timer_set,
            commands::timer_finish,
        ])
        .build()
}
