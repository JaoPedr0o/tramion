//! Sessões de foco concluídas (pomodoro).

use crate::error::FocusError;
use serde::Serialize;
use tramion_infra_sqlite::rusqlite::{Connection, params};

const DURATION_MAX_SEC: i64 = 86_400;
const NOTE_ID_MAX: usize = 100;
const LIST_LIMIT_DEFAULT: u32 = 200;
const LIST_LIMIT_MAX: u32 = 1000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    /// Quando começou (ms desde 1970).
    pub started_at: i64,
    pub duration_sec: i64,
    /// A página de notas em que a pessoa trabalhava (só um id de texto; pode já não existir).
    pub note_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Registra uma sessão de foco concluída.
pub fn record(
    conn: &Connection,
    started_at: i64,
    duration_sec: i64,
    note_id: Option<String>,
) -> Result<Session, FocusError> {
    let note_id = note_id
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty());
    if started_at <= 0
        || !(1..=DURATION_MAX_SEC).contains(&duration_sec)
        || note_id
            .as_deref()
            .is_some_and(|id| id.chars().count() > NOTE_ID_MAX || id.chars().any(char::is_control))
    {
        return Err(FocusError::SessionInvalid);
    }
    let id: String = conn.query_row(
        "INSERT INTO focus_session (started_at, duration_sec, note_id) VALUES (?1, ?2, ?3) RETURNING id",
        params![started_at, duration_sec, note_id],
        |row| row.get(0),
    )?;
    Ok(conn.query_row(
        "SELECT id, started_at, duration_sec, note_id, created_at, updated_at FROM focus_session WHERE id = ?1",
        [id],
        |row| {
            Ok(Session {
                id: row.get(0)?,
                started_at: row.get(1)?,
                duration_sec: row.get(2)?,
                note_id: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    )?)
}

/// As sessões mais recentes primeiro, a partir de `since` (ms) se informado.
pub fn list(
    conn: &Connection,
    since: Option<i64>,
    limit: Option<u32>,
) -> Result<Vec<Session>, FocusError> {
    let limit = limit.unwrap_or(LIST_LIMIT_DEFAULT).clamp(1, LIST_LIMIT_MAX);
    let mut statement = conn.prepare(
        "SELECT id, started_at, duration_sec, note_id, created_at, updated_at FROM focus_session
         WHERE started_at >= ?1 ORDER BY started_at DESC, rowid DESC LIMIT ?2",
    )?;
    let rows = statement
        .query_map(params![since.unwrap_or(0), limit], |row| {
            Ok(Session {
                id: row.get(0)?,
                started_at: row.get(1)?,
                duration_sec: row.get(2)?,
                note_id: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
