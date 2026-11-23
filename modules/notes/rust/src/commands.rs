//! Camada fina entre o Tauri e a lógica do módulo: recebe o pedido da interface, chama o serviço e
//! devolve o resultado. Nenhuma regra de negócio mora aqui.

use crate::assets;
use crate::database;
use crate::diagnostics;
use crate::duplicate;
use crate::error::NotesError;
use crate::exports;
use crate::external;
use crate::links::{self, Graph, PageRef};
use crate::model::{
    DatabaseData, DueTask, MoveNote, NewNote, Note, NoteSummary, Property, TrashSummary,
    UpdateNote, View,
};
use crate::search::{self, SearchHit};
use crate::service;
use crate::templates::{self, TemplateInfo};
use crate::versions::{self, VersionDetail, VersionSummary};
use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager, Runtime, State};
use tramion_infra_sqlite::SharedDatabase;
use tramion_infra_sqlite::rusqlite::Connection;

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
    content: String,
    expected_updated_at: i64,
) -> Result<Note, CommandError> {
    with_db(&db, |conn| {
        service::update(
            conn,
            UpdateNote {
                id,
                title,
                body,
                content,
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

/// Guarda um arquivo enviado (imagem, vídeo ou áudio) na pasta de dados do app e devolve o caminho.
/// O conteúdo vem como corpo BRUTO da chamada (sem converter para JSON, que seria lento para arquivos
/// grandes) e o nome original, no cabeçalho `x-file-name` (codificado em URL).
#[tauri::command]
pub async fn save_asset<R: Runtime>(
    app: AppHandle<R>,
    request: Request<'_>,
) -> Result<String, CommandError> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(NotesError::AssetInvalid.into());
    };
    let file_name = request
        .headers()
        .get("x-file-name")
        .and_then(|value| value.to_str().ok())
        .map(percent_decode)
        .unwrap_or_default();
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| NotesError::Internal(e.to_string()))?
        .join("assets");

    let path = assets::store(&dir, &file_name, bytes)?;
    Ok(path.to_string_lossy().into_owned())
}

/// Abre um link no navegador do sistema. Só `http` e `https`.
#[tauri::command]
pub async fn open_external(url: String) -> Result<(), CommandError> {
    Ok(external::open_external(&url)?)
}

/// Decodifica `%XX` (o JavaScript envia o nome já codificado, porque cabeçalhos só aceitam ASCII).
fn percent_decode(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && let Ok(byte) = u8::from_str_radix(&raw[i + 1..i + 3], 16)
        {
            out.push(byte);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Define o símbolo e a capa de uma página (`null` limpa). Os dois são enviados juntos.
#[tauri::command]
pub async fn set_appearance(
    db: State<'_, SharedDatabase>,
    id: String,
    icon: Option<String>,
    cover: Option<String>,
) -> Result<Note, CommandError> {
    with_db(&db, |conn| {
        service::set_appearance(conn, &id, icon.as_deref(), cover.as_deref())
    })
}

/// Registra no terminal do app um erro que aconteceu na interface (assim ele não some quando a tela quebra).
#[tauri::command]
pub async fn report_error(message: String) -> Result<(), CommandError> {
    eprintln!("{}", diagnostics::format_report(&message));
    Ok(())
}

#[tauri::command]
pub async fn create_database(
    db: State<'_, SharedDatabase>,
    title: String,
    parent_id: Option<String>,
) -> Result<Note, CommandError> {
    with_db(&db, |conn| {
        database::create_database(conn, &title, parent_id.as_deref())
    })
}

#[tauri::command]
pub async fn get_database(
    db: State<'_, SharedDatabase>,
    id: String,
) -> Result<DatabaseData, CommandError> {
    with_db(&db, |conn| database::get_database(conn, &id))
}

#[tauri::command]
pub async fn add_property(
    db: State<'_, SharedDatabase>,
    database_id: String,
    name: String,
    kind: String,
) -> Result<Property, CommandError> {
    with_db(&db, |conn| {
        database::add_property(conn, &database_id, &name, &kind)
    })
}

#[tauri::command]
pub async fn update_property(
    db: State<'_, SharedDatabase>,
    id: String,
    name: Option<String>,
    options: Option<serde_json::Value>,
) -> Result<Property, CommandError> {
    with_db(&db, |conn| {
        database::update_property(conn, &id, name.as_deref(), options.as_ref())
    })
}

#[tauri::command]
pub async fn delete_property(
    db: State<'_, SharedDatabase>,
    id: String,
) -> Result<(), CommandError> {
    with_db(&db, |conn| database::delete_property(conn, &id))
}

#[tauri::command]
pub async fn create_row(
    db: State<'_, SharedDatabase>,
    database_id: String,
    title: String,
) -> Result<Note, CommandError> {
    with_db(&db, |conn| database::create_row(conn, &database_id, &title))
}

#[tauri::command]
pub async fn set_cell(
    db: State<'_, SharedDatabase>,
    note_id: String,
    property_id: String,
    value: serde_json::Value,
) -> Result<(), CommandError> {
    with_db(&db, |conn| {
        database::set_cell(conn, &note_id, &property_id, &value)
    })
}

#[tauri::command]
pub async fn rename_note(
    db: State<'_, SharedDatabase>,
    id: String,
    title: String,
    expected_updated_at: i64,
) -> Result<Note, CommandError> {
    with_db(&db, |conn| {
        database::rename_note(conn, &id, &title, expected_updated_at)
    })
}

#[tauri::command]
pub async fn empty_trash(db: State<'_, SharedDatabase>) -> Result<Vec<String>, CommandError> {
    with_db(&db, service::empty_trash)
}

#[tauri::command]
pub async fn search(
    db: State<'_, SharedDatabase>,
    query: String,
    limit: usize,
) -> Result<Vec<SearchHit>, CommandError> {
    with_db(&db, |conn| search::search(conn, &query, limit))
}

#[tauri::command]
pub async fn add_view(
    db: State<'_, SharedDatabase>,
    database_id: String,
    name: String,
    config: serde_json::Value,
) -> Result<View, CommandError> {
    with_db(&db, |conn| {
        database::add_view(conn, &database_id, &name, &config)
    })
}

#[tauri::command]
pub async fn update_view(
    db: State<'_, SharedDatabase>,
    id: String,
    name: Option<String>,
    config: Option<serde_json::Value>,
) -> Result<View, CommandError> {
    with_db(&db, |conn| {
        database::update_view(conn, &id, name.as_deref(), config.as_ref())
    })
}

#[tauri::command]
pub async fn delete_view(db: State<'_, SharedDatabase>, id: String) -> Result<(), CommandError> {
    with_db(&db, |conn| database::delete_view(conn, &id))
}

#[tauri::command]
pub async fn duplicate_note(
    db: State<'_, SharedDatabase>,
    id: String,
) -> Result<Vec<String>, CommandError> {
    with_db(&db, |conn| duplicate::duplicate(conn, &id))
}

#[tauri::command]
pub async fn list_templates(
    db: State<'_, SharedDatabase>,
) -> Result<Vec<TemplateInfo>, CommandError> {
    with_db(&db, templates::list_templates)
}

#[tauri::command]
pub async fn create_from_template(
    db: State<'_, SharedDatabase>,
    template_id: String,
    parent_id: Option<String>,
) -> Result<Note, CommandError> {
    with_db(&db, |conn| {
        templates::create_from_template(conn, &template_id, parent_id.as_deref())
    })
}

/// Grava o Markdown de uma página na pasta Downloads do usuário e devolve o caminho do arquivo criado.
#[tauri::command]
pub async fn save_markdown<R: Runtime>(
    app: AppHandle<R>,
    title: String,
    content: String,
) -> Result<String, CommandError> {
    let dir = app
        .path()
        .download_dir()
        .map_err(|e| NotesError::Internal(e.to_string()))?;
    let path = exports::save_markdown(&dir, &title, &content)?;
    Ok(path.display().to_string())
}

/// Liga, troca ou desliga (`config` nulo) os lembretes de tarefas de uma base.
#[tauri::command]
pub async fn set_reminders(
    db: State<'_, SharedDatabase>,
    database_id: String,
    config: Option<serde_json::Value>,
) -> Result<Option<serde_json::Value>, CommandError> {
    with_db(&db, |conn| {
        database::set_reminders(conn, &database_id, config.as_ref())
    })
}

/// As tarefas atrasadas ou que vencem em `today` (data local do usuário, `AAAA-MM-DD`).
#[tauri::command]
pub async fn due_tasks(
    db: State<'_, SharedDatabase>,
    today: String,
) -> Result<Vec<DueTask>, CommandError> {
    with_db(&db, |conn| database::due_tasks(conn, &today))
}

/// As tarefas com prazo nos próximos `days` dias (depois de `today`).
#[tauri::command]
pub async fn upcoming_tasks(
    db: State<'_, SharedDatabase>,
    today: String,
    days: i64,
) -> Result<Vec<DueTask>, CommandError> {
    with_db(&db, |conn| database::upcoming_tasks(conn, &today, days))
}

/// As páginas que mencionam a página `id`.
#[tauri::command]
pub async fn backlinks(
    db: State<'_, SharedDatabase>,
    id: String,
) -> Result<Vec<PageRef>, CommandError> {
    with_db(&db, |conn| links::backlinks(conn, &id))
}

/// O grafo de conexões entre as páginas.
#[tauri::command]
pub async fn graph(db: State<'_, SharedDatabase>) -> Result<Graph, CommandError> {
    with_db(&db, links::graph)
}

/// O histórico de versões de uma página, da mais recente para a mais antiga.
#[tauri::command]
pub async fn list_versions(
    db: State<'_, SharedDatabase>,
    note_id: String,
) -> Result<Vec<VersionSummary>, CommandError> {
    with_db(&db, |conn| versions::list_versions(conn, &note_id))
}

/// Uma versão inteira (texto simples), para ver antes de restaurar.
#[tauri::command]
pub async fn get_version(
    db: State<'_, SharedDatabase>,
    version_id: String,
) -> Result<VersionDetail, CommandError> {
    with_db(&db, |conn| versions::get_version(conn, &version_id))
}

/// Restaura uma versão da página (guardando antes o estado atual).
#[tauri::command]
pub async fn restore_version(
    db: State<'_, SharedDatabase>,
    note_id: String,
    version_id: String,
    expected_updated_at: i64,
) -> Result<Note, CommandError> {
    with_db(&db, |conn| {
        versions::restore_version(conn, &note_id, &version_id, expected_updated_at)
    })
}

/// Salva uma página comum como modelo.
#[tauri::command]
pub async fn save_as_template(
    db: State<'_, SharedDatabase>,
    note_id: String,
) -> Result<TemplateInfo, CommandError> {
    with_db(&db, |conn| templates::save_as_template(conn, &note_id))
}

/// Apaga um modelo criado pela pessoa.
#[tauri::command]
pub async fn delete_template(
    db: State<'_, SharedDatabase>,
    template_id: String,
) -> Result<(), CommandError> {
    with_db(&db, |conn| {
        templates::delete_user_template(conn, &template_id)
    })
}

/// Grava todas as páginas (já em Markdown) na pasta `Downloads/Tramion`, espelhando a hierarquia. Substitui os arquivos
/// de uma exportação anterior e nunca apaga nada.
#[tauri::command]
pub async fn export_all<R: Runtime>(
    app: AppHandle<R>,
    files: Vec<exports::ExportFile>,
) -> Result<exports::ExportReport, CommandError> {
    let root = app
        .path()
        .download_dir()
        .map_err(|e| NotesError::Internal(e.to_string()))?
        .join("Tramion");
    Ok(exports::export_tree(&root, &files)?)
}

/// Abre um pareamento novo: devolve o QR (e o código para digitar) que o celular lê. Vale 5 minutos e um único uso.
#[tauri::command]
pub async fn sync_pair_start<R: Runtime>(
    app: AppHandle<R>,
) -> Result<crate::sync_server::PairingOffer, CommandError> {
    Ok(crate::sync_server::start_pairing(&app)?)
}

/// Fecha o pareamento aberto (o QR deixa de valer).
#[tauri::command]
pub fn sync_pair_cancel(state: State<'_, crate::sync_server::SyncState>) {
    state.cancel_pairing();
}

/// Os aparelhos pareados (sem os segredos).
#[tauri::command]
pub fn sync_peers(
    db: State<'_, SharedDatabase>,
) -> Result<Vec<crate::sync_peers::Peer>, CommandError> {
    with_db(&db, crate::sync_peers::list_peers)
}

/// Desfaz o pareamento de um aparelho: ele nunca mais conecta com o segredo antigo.
#[tauri::command]
pub fn sync_peer_remove(
    db: State<'_, SharedDatabase>,
    device: String,
) -> Result<bool, CommandError> {
    with_db(&db, |conn| crate::sync_peers::remove_peer(conn, &device))
}
