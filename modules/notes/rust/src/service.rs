//! Regras de negócio das notas: validação, detecção de conflito e o significado de cada erro.
//! Não conhece o Tauri nem escreve SQL: usa o repositório. Por isso é testável com um banco em memória.

use crate::error::NotesError;
use crate::model::{NewNote, Note, NoteSummary, UpdateNote};
use crate::repository;
use aun_infra_sqlite::rusqlite::Connection;

/// Máximo de caracteres do título (o `CHECK` da migração 1 impõe o mesmo limite).
pub const MAX_TITLE_CHARS: usize = 200;

/// Remove espaços das pontas e confere o tamanho. Conta CARACTERES, não bytes: "é" é 1 caractere.
fn validate_title(raw: &str) -> Result<&str, NotesError> {
    let title = raw.trim();
    if title.is_empty() {
        return Err(NotesError::TitleEmpty);
    }
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(NotesError::TitleTooLong {
            max: MAX_TITLE_CHARS,
        });
    }
    Ok(title)
}

pub fn create(conn: &Connection, input: NewNote) -> Result<Note, NotesError> {
    let title = validate_title(&input.title)?;
    Ok(repository::insert(conn, title, &input.body)?)
}

pub fn get(conn: &Connection, id: &str) -> Result<Note, NotesError> {
    repository::find(conn, id)?.ok_or(NotesError::NotFound)
}

pub fn list(conn: &Connection) -> Result<Vec<NoteSummary>, NotesError> {
    Ok(repository::list_active(conn)?)
}

pub fn list_trash(conn: &Connection) -> Result<Vec<NoteSummary>, NotesError> {
    Ok(repository::list_trashed(conn)?)
}

pub fn update(conn: &Connection, input: UpdateNote) -> Result<Note, NotesError> {
    let title = validate_title(&input.title)?;
    match repository::update_if_current(
        conn,
        &input.id,
        title,
        &input.body,
        input.expected_updated_at,
    )? {
        Some(note) => Ok(note),
        // Nenhuma linha atingida: descobre o motivo para devolver o erro certo.
        None => Err(match repository::state_of(conn, &input.id)? {
            None => NotesError::NotFound,
            Some((_, Some(_deleted))) => NotesError::InTrash,
            Some((current_updated_at, None)) => NotesError::Conflict { current_updated_at },
        }),
    }
}

pub fn set_pinned(conn: &Connection, id: &str, pinned: bool) -> Result<Note, NotesError> {
    match repository::set_pinned(conn, id, pinned)? {
        Some(note) => Ok(note),
        None => Err(match repository::state_of(conn, id)? {
            None => NotesError::NotFound,
            Some(_) => NotesError::InTrash,
        }),
    }
}

/// Manda para a lixeira. Repetir a operação numa nota que já está lá não é erro (idempotente).
pub fn delete(conn: &Connection, id: &str) -> Result<(), NotesError> {
    if repository::soft_delete(conn, id)? == 0 && repository::state_of(conn, id)?.is_none() {
        return Err(NotesError::NotFound);
    }
    Ok(())
}

/// Tira da lixeira. Restaurar uma nota que já está ativa não é erro (idempotente).
pub fn restore(conn: &Connection, id: &str) -> Result<(), NotesError> {
    if repository::restore(conn, id)? == 0 && repository::state_of(conn, id)?.is_none() {
        return Err(NotesError::NotFound);
    }
    Ok(())
}

/// Apaga de vez. Só vale para notas que já estão na lixeira: nunca se perde uma nota ativa por engano.
pub fn purge(conn: &Connection, id: &str) -> Result<(), NotesError> {
    if repository::purge_trashed(conn, id)? == 0 {
        return Err(match repository::state_of(conn, id)? {
            None => NotesError::NotFound,
            Some(_) => NotesError::NotInTrash,
        });
    }
    Ok(())
}
