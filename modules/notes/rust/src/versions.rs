//! Histórico de versões: antes de uma edição sobrescrever uma página, o estado anterior é guardado (no máximo um
//! instantâneo a cada 10 minutos, e até 30 por página). Restaurar uma versão também guarda o estado atual, então dá para
//! desfazer. Guardar o histórico é "melhor esforço": se falhar, a edição do usuário não é desfeita.

use crate::error::NotesError;
use crate::model::Note;
use crate::repository;
use crate::service;
use serde::Serialize;
use tramion_infra_sqlite::rusqlite::{Connection, OptionalExtension, Row, params};

/// Intervalo mínimo entre dois instantâneos automáticos de uma página (10 minutos).
pub const MIN_GAP_MS: i64 = 10 * 60 * 1000;
/// Máximo de versões guardadas por página (as mais antigas saem).
pub const MAX_VERSIONS: usize = 30;
/// Máximo de caracteres da prévia na lista.
const PREVIEW_CHARS: usize = 160;

/// Uma versão na lista do histórico.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionSummary {
    pub id: String,
    pub title: String,
    /// Começo do texto, em uma linha.
    pub preview: String,
    /// Quando esse estado foi salvo pela última vez (ms).
    pub saved_at: i64,
}

/// Uma versão inteira (texto simples), para ver antes de restaurar.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionDetail {
    pub id: String,
    pub title: String,
    pub body: String,
    pub saved_at: i64,
}

fn one_line(text: &str) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut preview: String = flat.chars().take(PREVIEW_CHARS).collect();
    if flat.chars().count() > PREVIEW_CHARS {
        preview.push('…');
    }
    preview
}

fn now_ms(conn: &Connection) -> Result<i64, NotesError> {
    Ok(conn.query_row(
        "SELECT CAST(unixepoch('subsec') * 1000 AS INTEGER)",
        [],
        |r| r.get(0),
    )?)
}

/// Guarda o estado `previous` se já passou tempo suficiente desde o último instantâneo (ou se `force`). Estados vazios
/// (página recém-criada) não valem a pena. Poda as versões mais antigas além do limite. Devolve se guardou.
pub fn snapshot_if_due(
    conn: &Connection,
    previous: &Note,
    now_ms: i64,
    force: bool,
) -> Result<bool, NotesError> {
    if previous.content == "[]" && previous.body.trim().is_empty() {
        return Ok(false);
    }
    let newest: Option<i64> = conn
        .query_row(
            "SELECT MAX(created_at) FROM notes_version WHERE note_id = ?1",
            [&previous.id],
            |r| r.get(0),
        )
        .optional()?
        .flatten();
    if !force && newest.is_some_and(|created| now_ms - created < MIN_GAP_MS) {
        return Ok(false);
    }
    conn.execute(
        "INSERT INTO notes_version (note_id, title, body, content, saved_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            previous.id,
            previous.title,
            previous.body,
            previous.content,
            previous.updated_at,
            now_ms
        ],
    )?;
    conn.execute(
        "DELETE FROM notes_version
          WHERE note_id = ?1
            AND id NOT IN (SELECT id FROM notes_version WHERE note_id = ?1
                            ORDER BY created_at DESC, rowid DESC LIMIT ?2)",
        params![previous.id, MAX_VERSIONS as i64],
    )?;
    Ok(true)
}

/// Chamado pelo serviço depois de uma edição bem-sucedida: guarda o estado anterior se a regra permitir.
pub(crate) fn after_update(conn: &Connection, previous: &Note, current: &Note, force: bool) {
    let changed = previous.title != current.title || previous.content != current.content;
    if !changed {
        return;
    }
    if let Ok(now) = now_ms(conn) {
        let _ = snapshot_if_due(conn, previous, now, force);
    }
}

fn summary_from_row(
    row: &Row<'_>,
) -> Result<VersionSummary, tramion_infra_sqlite::rusqlite::Error> {
    let body: String = row.get(2)?;
    Ok(VersionSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        preview: one_line(&body),
        saved_at: row.get(3)?,
    })
}

/// As versões de uma página, da mais recente para a mais antiga.
pub fn list_versions(conn: &Connection, note_id: &str) -> Result<Vec<VersionSummary>, NotesError> {
    repository::find(conn, note_id)?.ok_or(NotesError::NotFound)?;
    let mut stmt = conn.prepare(
        "SELECT id, title, body, saved_at FROM notes_version
          WHERE note_id = ?1 ORDER BY created_at DESC, rowid DESC",
    )?;
    Ok(stmt
        .query_map([note_id], summary_from_row)?
        .collect::<Result<_, _>>()?)
}

/// Uma versão inteira, do texto simples.
pub fn get_version(conn: &Connection, version_id: &str) -> Result<VersionDetail, NotesError> {
    conn.query_row(
        "SELECT id, title, body, saved_at FROM notes_version WHERE id = ?1",
        [version_id],
        |row| {
            Ok(VersionDetail {
                id: row.get(0)?,
                title: row.get(1)?,
                body: row.get(2)?,
                saved_at: row.get(3)?,
            })
        },
    )
    .optional()?
    .ok_or(NotesError::NotFound)
}

/// Restaura uma versão: a página volta ao título, texto e conteúdo daquela versão. O estado atual é guardado antes (sempre),
/// então a restauração também pode ser desfeita. Respeita a versão esperada, como toda edição.
pub fn restore_version(
    conn: &Connection,
    note_id: &str,
    version_id: &str,
    expected_updated_at: i64,
) -> Result<Note, NotesError> {
    let (title, body, content): (String, String, String) = conn
        .query_row(
            "SELECT title, body, content FROM notes_version WHERE id = ?1 AND note_id = ?2",
            params![version_id, note_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?
        .ok_or(NotesError::NotFound)?;
    service::update_forcing_snapshot(
        conn,
        crate::model::UpdateNote {
            id: note_id.to_string(),
            title,
            body,
            content,
            expected_updated_at,
        },
    )
}
