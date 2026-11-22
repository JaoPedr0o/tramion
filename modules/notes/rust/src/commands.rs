//! Camada fina entre o Tauri e a lógica do módulo: recebe o pedido da interface, chama o serviço e
//! devolve o resultado. Nenhuma regra de negócio mora aqui.

use crate::error::NotesError;
use crate::model::{MoveNote, NewNote, Note, NoteSummary, TrashSummary, UpdateNote};
use crate::service;
use aun_infra_sqlite::SharedDatabase;
use aun_infra_sqlite::rusqlite::Connection;
use serde::Serialize;
use tauri::State;

/// Erro enviado à interface: um código estável (para ela traduzir em mensagem) e um texto técnico.
#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
}

impl From<NotesError> for CommandError {
    fn from(error: NotesError) -> Self {
        Self {
            code: error.code(),
            message: error.to_string(),
        }
    }
}

/// Trava o banco (um acesso por vez), roda a operação e converte o erro.
fn with_db<T>(
    db: &SharedDatabase,
    operation: impl FnOnce(&Connection) -> Result<T, NotesError>,
) -> Result<T, CommandError> {
    let guard = db
        .lock()
        .map_err(|_| NotesError::Internal("trava do banco envenenada".to_string()))?;
    Ok(operation(guard.connection())?)
}

// Todos os comandos são `async`: o Tauri os roda fora da thread da janela. Um comando síncrono
// seguraria a interface durante o acesso ao banco.

#[tauri::command]
pub async fn create(
    db: State<'_, SharedDatabase>,
    title: String,
    body: String,
    parent_id: Option<String>,
) -> Result<Note, CommandError> {
    with_db(&db, |conn| {
        service::create(
            conn,
            NewNote {
                title,
                body,
                parent_id,
            },
        )
    })
}

#[tauri::command]
pub async fn get(db: State<'_, SharedDatabase>, id: String) -> Result<Note, CommandError> {
    with_db(&db, |conn| service::get(conn, &id))
}

#[tauri::command]
pub async fn list(db: State<'_, SharedDatabase>) -> Result<Vec<NoteSummary>, CommandError> {
    with_db(&db, service::list)
}

#[tauri::command]
pub async fn list_trash(db: State<'_, SharedDatabase>) -> Result<Vec<TrashSummary>, CommandError> {
    with_db(&db, service::list_trash)
}

#[tauri::command]
pub async fn update(
    db: State<'_, SharedDatabase>,
    id: String,
    title: String,
    body: String,
    expected_updated_at: i64,
) -> Result<Note, CommandError> {
    with_db(&db, |conn| {
        service::update(
            conn,
            UpdateNote {
                id,
                title,
                body,
                expected_updated_at,
            },
        )
    })
}

#[tauri::command]
pub async fn set_pinned(
    db: State<'_, SharedDatabase>,
    id: String,
    pinned: bool,
) -> Result<Note, CommandError> {
    with_db(&db, |conn| service::set_pinned(conn, &id, pinned))
}

/// Move uma página para outro pai (ou para a raiz) numa posição entre as irmãs do destino.
#[tauri::command]
pub async fn move_note(
    db: State<'_, SharedDatabase>,
    id: String,
    new_parent_id: Option<String>,
    index: usize,
) -> Result<Note, CommandError> {
    with_db(&db, |conn| {
        service::move_note(
            conn,
            MoveNote {
                id,
                new_parent_id,
                index,
            },
        )
    })
}

// `delete`, `restore` e `purge` devolvem os ids de TODAS as páginas afetadas (a página e suas
// subpáginas), para a interface publicar um evento por página.

#[tauri::command]
pub async fn delete(
    db: State<'_, SharedDatabase>,
    id: String,
) -> Result<Vec<String>, CommandError> {
    with_db(&db, |conn| service::delete(conn, &id))
}

#[tauri::command]
pub async fn restore(
    db: State<'_, SharedDatabase>,
    id: String,
) -> Result<Vec<String>, CommandError> {
    with_db(&db, |conn| service::restore(conn, &id))
}

#[tauri::command]
pub async fn purge(db: State<'_, SharedDatabase>, id: String) -> Result<Vec<String>, CommandError> {
    with_db(&db, |conn| service::purge(conn, &id))
}
