//! Acesso ao SQL das notas. É o ÚNICO lugar do módulo que escreve SQL.
//! Aqui não há regras de negócio (validação, conflitos): só consultas e atualizações.

use crate::model::{Note, NoteSummary};
use aun_infra_sqlite::rusqlite::{Connection, OptionalExtension, Result, Row, params};

/// Instante atual em milissegundos, calculado pelo próprio SQLite.
const NOW_MS: &str = "CAST(unixepoch('subsec') * 1000 AS INTEGER)";

const NOTE_COLUMNS: &str = "id, title, body, pinned, created_at, updated_at, deleted_at";

fn note_from_row(row: &Row<'_>) -> Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        title: row.get(1)?,
        body: row.get(2)?,
        pinned: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        deleted_at: row.get(6)?,
    })
}

fn summary_from_row(row: &Row<'_>) -> Result<NoteSummary> {
    Ok(NoteSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        pinned: row.get(2)?,
        updated_at: row.get(3)?,
        deleted_at: row.get(4)?,
    })
}

pub fn insert(conn: &Connection, title: &str, body: &str) -> Result<Note> {
    conn.query_row(
        &format!("INSERT INTO notes_note (title, body) VALUES (?1, ?2) RETURNING {NOTE_COLUMNS}"),
        params![title, body],
        note_from_row,
    )
}

/// Busca por id, esteja a nota ativa ou na lixeira.
pub fn find(conn: &Connection, id: &str) -> Result<Option<Note>> {
    conn.query_row(
        &format!("SELECT {NOTE_COLUMNS} FROM notes_note WHERE id = ?1"),
        [id],
        note_from_row,
    )
    .optional()
}

/// Notas ativas (fora da lixeira): fixadas primeiro, depois as mais recentes.
pub fn list_active(conn: &Connection) -> Result<Vec<NoteSummary>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, pinned, updated_at, deleted_at
           FROM notes_note
          WHERE deleted_at IS NULL
          ORDER BY pinned DESC, updated_at DESC",
    )?;
    stmt.query_map([], summary_from_row)?.collect()
}

/// Notas na lixeira: as excluídas há menos tempo primeiro.
pub fn list_trashed(conn: &Connection) -> Result<Vec<NoteSummary>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, pinned, updated_at, deleted_at
           FROM notes_note
          WHERE deleted_at IS NOT NULL
          ORDER BY deleted_at DESC",
    )?;
    stmt.query_map([], summary_from_row)?.collect()
}

/// `(updated_at, deleted_at)` da nota, ou `None` se ela não existe. Usado para explicar por que
/// uma atualização não atingiu nenhuma linha.
pub fn state_of(conn: &Connection, id: &str) -> Result<Option<(i64, Option<i64>)>> {
    conn.query_row(
        "SELECT updated_at, deleted_at FROM notes_note WHERE id = ?1",
        [id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
}

/// Edita título e corpo SE a nota ainda estiver na versão `expected_updated_at` e ativa.
/// Devolve `None` se nenhuma linha foi atingida.
///
/// O novo `updated_at` é `max(agora, anterior + 1)`: precisa SEMPRE aumentar, mesmo que duas
/// edições caiam no mesmo milissegundo. Se repetisse o valor, a verificação de conflito deixaria
/// passar uma edição baseada numa versão velha.
pub fn update_if_current(
    conn: &Connection,
    id: &str,
    title: &str,
    body: &str,
    expected_updated_at: i64,
) -> Result<Option<Note>> {
    conn.query_row(
        &format!(
            "UPDATE notes_note
                SET title = ?2, body = ?3, updated_at = max({NOW_MS}, updated_at + 1)
              WHERE id = ?1 AND updated_at = ?4 AND deleted_at IS NULL
          RETURNING {NOTE_COLUMNS}"
        ),
        params![id, title, body, expected_updated_at],
        note_from_row,
    )
    .optional()
}

/// Fixa ou desafixa uma nota ativa. Não mexe em `updated_at`: organizar não é editar o conteúdo
/// (e não deve causar conflito em quem está com a nota aberta).
pub fn set_pinned(conn: &Connection, id: &str, pinned: bool) -> Result<Option<Note>> {
    conn.query_row(
        &format!(
            "UPDATE notes_note SET pinned = ?2
              WHERE id = ?1 AND deleted_at IS NULL
          RETURNING {NOTE_COLUMNS}"
        ),
        params![id, pinned],
        note_from_row,
    )
    .optional()
}

/// Manda para a lixeira. Devolve quantas linhas mudaram (0 ou 1).
pub fn soft_delete(conn: &Connection, id: &str) -> Result<usize> {
    conn.execute(
        &format!(
            "UPDATE notes_note SET deleted_at = {NOW_MS} WHERE id = ?1 AND deleted_at IS NULL"
        ),
        [id],
    )
}

/// Tira da lixeira. Devolve quantas linhas mudaram (0 ou 1).
pub fn restore(conn: &Connection, id: &str) -> Result<usize> {
    conn.execute(
        "UPDATE notes_note SET deleted_at = NULL WHERE id = ?1 AND deleted_at IS NOT NULL",
        [id],
    )
}

/// Apaga DE VEZ, mas só se a nota já estiver na lixeira. Devolve quantas linhas foram apagadas.
pub fn purge_trashed(conn: &Connection, id: &str) -> Result<usize> {
    conn.execute(
        "DELETE FROM notes_note WHERE id = ?1 AND deleted_at IS NOT NULL",
        [id],
    )
}
