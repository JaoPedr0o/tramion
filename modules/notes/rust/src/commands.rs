//! Camada fina entre o Tauri e a lógica do módulo: recebe o pedido da interface, chama o
//! repositório e devolve o resultado. Nenhuma regra de negócio mora aqui.

use crate::model::NoteSummary;
use crate::repository;
use aun_infra_sqlite::SharedDatabase;
use serde::Serialize;
use tauri::State;

/// Erro enviado à interface: um código estável (para ela traduzir em mensagem) e um texto técnico.
#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
}

impl CommandError {
    fn internal(message: impl ToString) -> Self {
        Self {
            code: "notes.internal",
            message: message.to_string(),
        }
    }
}

// `async` faz o Tauri rodar o comando fora da thread da janela: um comando síncrono seguraria a
// interface durante o acesso ao banco.
#[tauri::command]
pub async fn list(db: State<'_, SharedDatabase>) -> Result<Vec<NoteSummary>, CommandError> {
    let db = db.lock().map_err(CommandError::internal)?;
    repository::list_active(db.connection()).map_err(CommandError::internal)
}
