//! Camada fina entre o Tauri e a lógica do módulo. Nenhuma regra de negócio mora aqui.

use crate::error::FocusError;
use crate::habits::{self, Habit, HabitCheck, HabitInput};
use crate::sessions::{self, Session};
use crate::settings::{self, PomodoroSettings};
use crate::timer::{self, Finish, TimerState};
use serde::Serialize;
use tauri::State;
use tramion_infra_sqlite::SharedDatabase;
use tramion_infra_sqlite::rusqlite::Connection;

/// Erro enviado à interface: um código estável (para ela traduzir em mensagem) e um texto técnico.
#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
}

impl From<FocusError> for CommandError {
    fn from(error: FocusError) -> Self {
        Self {
            code: error.code(),
            message: error.to_string(),
        }
    }
}

/// Trava o banco (um acesso por vez), roda a operação e converte o erro.
fn with_db<T>(
    db: &SharedDatabase,
    operation: impl FnOnce(&Connection) -> Result<T, FocusError>,
) -> Result<T, CommandError> {
    let guard = db
        .lock()
        .map_err(|_| FocusError::Internal("trava do banco envenenada".to_string()))?;
    Ok(operation(guard.connection())?)
}

// `async` para o Tauri rodar fora da thread da janela (como no módulo de notas).

#[tauri::command]
pub async fn habit_list(
    db: State<'_, SharedDatabase>,
    include_archived: bool,
) -> Result<Vec<Habit>, CommandError> {
    with_db(&db, |conn| habits::list(conn, include_archived))
}

#[tauri::command]
pub async fn habit_create(
    db: State<'_, SharedDatabase>,
    input: HabitInput,
) -> Result<Habit, CommandError> {
    with_db(&db, |conn| habits::create(conn, input))
}

#[tauri::command]
pub async fn habit_update(
    db: State<'_, SharedDatabase>,
    id: String,
    input: HabitInput,
) -> Result<Habit, CommandError> {
    with_db(&db, |conn| habits::update(conn, &id, input))
}

#[tauri::command]
pub async fn habit_archive(
    db: State<'_, SharedDatabase>,
    id: String,
    archived: bool,
) -> Result<Habit, CommandError> {
    with_db(&db, |conn| habits::archive(conn, &id, archived))
}

#[tauri::command]
pub async fn habit_checks(
    db: State<'_, SharedDatabase>,
    from: String,
    to: String,
) -> Result<Vec<HabitCheck>, CommandError> {
    with_db(&db, |conn| habits::checks(conn, &from, &to))
}

#[tauri::command]
pub async fn habit_set_check(
    db: State<'_, SharedDatabase>,
    habit_id: String,
    day: String,
    done: bool,
) -> Result<(), CommandError> {
    with_db(&db, |conn| habits::set_check(conn, &habit_id, &day, done))
}

#[tauri::command]
pub async fn session_record(
    db: State<'_, SharedDatabase>,
    started_at: i64,
    duration_sec: i64,
    note_id: Option<String>,
) -> Result<Session, CommandError> {
    with_db(&db, |conn| {
        sessions::record(conn, started_at, duration_sec, note_id)
    })
}

#[tauri::command]
pub async fn session_list(
    db: State<'_, SharedDatabase>,
    since: Option<i64>,
    limit: Option<u32>,
) -> Result<Vec<Session>, CommandError> {
    with_db(&db, |conn| sessions::list(conn, since, limit))
}

#[tauri::command]
pub async fn settings_get(db: State<'_, SharedDatabase>) -> Result<PomodoroSettings, CommandError> {
    with_db(&db, settings::get)
}

#[tauri::command]
pub async fn settings_set(
    db: State<'_, SharedDatabase>,
    settings: PomodoroSettings,
) -> Result<PomodoroSettings, CommandError> {
    with_db(&db, |conn| settings::set(conn, &settings))
}

#[tauri::command]
pub async fn timer_get(db: State<'_, SharedDatabase>) -> Result<TimerState, CommandError> {
    with_db(&db, timer::get)
}

#[tauri::command]
pub async fn timer_set(
    db: State<'_, SharedDatabase>,
    state: TimerState,
) -> Result<TimerState, CommandError> {
    with_db(&db, |conn| timer::set(conn, &state))
}

#[tauri::command]
pub async fn timer_finish(
    db: State<'_, SharedDatabase>,
    cycle: i64,
) -> Result<Finish, CommandError> {
    with_db(&db, |conn| timer::finish(conn, cycle))
}
