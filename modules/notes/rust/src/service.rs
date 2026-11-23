//! Regras de negócio das notas: validação, hierarquia, detecção de conflito e o significado de cada
//! erro. Não conhece o Tauri nem escreve SQL: usa o repositório. Por isso é testável com banco em memória.
//!
//! Invariantes que estas regras mantêm:
//! 1. O pai de uma nota ativa é nulo ou outra nota ativa.
//! 2. Se uma nota está na lixeira, todas as suas descendentes também estão.
//! 3. Não existem ciclos.

use crate::error::NotesError;
use crate::model::{MoveNote, NewNote, Note, NoteSummary, TrashSummary, UpdateNote};
use crate::repository;
use aun_infra_sqlite::rusqlite::Connection;
use std::collections::HashMap;

/// Máximo de caracteres do título (o `CHECK` da migração 1 impõe o mesmo limite).
pub const MAX_TITLE_CHARS: usize = 200;

/// Máximo de caracteres do símbolo (um emoji pode juntar vários, como bandeiras e famílias).
pub const MAX_ICON_CHARS: usize = 16;

/// Máximo de caracteres do endereço de uma capa em imagem.
pub const MAX_COVER_URL_CHARS: usize = 2000;

/// O símbolo da página: sem espaços nas pontas, não vazio, curto e sem caracteres de controle.
pub fn validate_icon(icon: &str) -> Result<&str, NotesError> {
    let icon = icon.trim();
    if icon.is_empty()
        || icon.chars().count() > MAX_ICON_CHARS
        || icon.chars().any(char::is_control)
    {
        return Err(NotesError::IconInvalid);
    }
    Ok(icon)
}

/// A capa só aceita três formatos, para que o que vai parar num estilo da tela seja sempre seguro:
/// `color:#rrggbb`, `gradient:<nome da galeria>` e `image:<endereço>` (http, https ou um arquivo do app).
pub fn validate_cover(cover: &str) -> Result<&str, NotesError> {
    let valid = if let Some(hex) = cover.strip_prefix("color:#") {
        hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit())
    } else if let Some(name) = cover.strip_prefix("gradient:") {
        (1..=32).contains(&name.len())
            && name
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    } else if let Some(url) = cover.strip_prefix("image:") {
        let lower = url.to_ascii_lowercase();
        let scheme_ok = [
            "https://",
            "http://",
            "asset://localhost/",
            "http://asset.localhost/",
        ]
        .iter()
        .any(|scheme| lower.starts_with(scheme));
        scheme_ok
            && url.chars().count() <= MAX_COVER_URL_CHARS
            && !url
                .chars()
                .any(|c| c.is_control() || c.is_whitespace() || "\"'\\<>()".contains(c))
    } else {
        false
    };
    if valid {
        Ok(cover)
    } else {
        Err(NotesError::CoverInvalid)
    }
}

/// Define (ou limpa, com `None`) o símbolo e a capa de uma página ativa. Não altera `updated_at`.
pub fn set_appearance(
    conn: &Connection,
    id: &str,
    icon: Option<&str>,
    cover: Option<&str>,
) -> Result<Note, NotesError> {
    let icon = icon.map(validate_icon).transpose()?;
    let cover = cover.map(validate_cover).transpose()?;
    match repository::set_appearance(conn, id, icon, cover)? {
        Some(note) => Ok(note),
        None => Err(match repository::state_of(conn, id)? {
            None => NotesError::NotFound,
            Some(_) => NotesError::InTrash,
        }),
    }
}

/// Tamanho máximo do conteúdo (os blocos em JSON), em bytes.
pub const MAX_CONTENT_BYTES: usize = 5_000_000;

/// O conteúdo precisa ser uma LISTA em JSON válido e caber no limite. O Rust não interpreta os blocos
/// (quem sabe o que é cada bloco é o editor); só garante que o que vai para o banco é um JSON de lista.
fn validate_content(content: &str) -> Result<(), NotesError> {
    if content.len() > MAX_CONTENT_BYTES {
        return Err(NotesError::ContentTooLarge {
            max: MAX_CONTENT_BYTES,
        });
    }
    match serde_json::from_str::<serde_json::Value>(content) {
        Ok(serde_json::Value::Array(_)) => Ok(()),
        _ => Err(NotesError::ContentInvalid),
    }
}

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

/// Confere que `parent_id` (se houver) existe e está ativa.
fn ensure_active_parent(conn: &Connection, parent_id: Option<&str>) -> Result<(), NotesError> {
    let Some(parent) = parent_id else {
        return Ok(());
    };
    match repository::state_of(conn, parent)? {
        None => Err(NotesError::ParentNotFound),
        Some((_, Some(_deleted))) => Err(NotesError::ParentInTrash),
        Some((_, None)) => Ok(()),
    }
}

pub fn create(conn: &Connection, input: NewNote) -> Result<Note, NotesError> {
    let title = validate_title(&input.title)?;
    ensure_active_parent(conn, input.parent_id.as_deref())?;
    Ok(repository::insert(
        conn,
        title,
        &input.body,
        input.parent_id.as_deref(),
    )?)
}

pub fn get(conn: &Connection, id: &str) -> Result<Note, NotesError> {
    repository::find(conn, id)?.ok_or(NotesError::NotFound)
}

/// Notas ativas, planas (a interface monta a árvore a partir de `parent_id` e `position`).
pub fn list(conn: &Connection) -> Result<Vec<NoteSummary>, NotesError> {
    Ok(repository::list_active(conn)?)
}

/// Lixeira: só as RAÍZES de cada exclusão, com a contagem de subpáginas excluídas junto.
pub fn list_trash(conn: &Connection) -> Result<Vec<TrashSummary>, NotesError> {
    Ok(build_trash(&repository::list_trashed_rows(conn)?))
}

/// Uma nota da lixeira é raiz se não tem pai, ou o pai não está na lixeira, ou o pai foi excluído em
/// OUTRA ocasião (instante diferente). As demais foram excluídas junto com uma raiz.
fn build_trash(rows: &[repository::TrashedRow]) -> Vec<TrashSummary> {
    let by_id: HashMap<&str, &repository::TrashedRow> =
        rows.iter().map(|row| (row.0.as_str(), row)).collect();

    // Sobe pela cadeia de pais com o MESMO instante até achar a raiz da exclusão.
    let root_of = |row: &repository::TrashedRow| -> String {
        let mut current = row;
        while let Some(parent) = current.2.as_deref().and_then(|p| by_id.get(p)) {
            if parent.3 != current.3 {
                break;
            }
            current = parent;
        }
        current.0.clone()
    };

    let mut counts: HashMap<String, i64> = HashMap::new();
    for row in rows {
        let root = root_of(row);
        if root != row.0 {
            *counts.entry(root).or_insert(0) += 1;
        }
    }

    rows.iter()
        .filter(|row| root_of(row) == row.0)
        .map(|row| TrashSummary {
            id: row.0.clone(),
            title: row.1.clone(),
            deleted_at: row.3,
            descendant_count: counts.get(&row.0).copied().unwrap_or(0),
        })
        .collect()
}

pub fn update(conn: &Connection, input: UpdateNote) -> Result<Note, NotesError> {
    let title = validate_title(&input.title)?;
    validate_content(&input.content)?;
    match repository::update_if_current(
        conn,
        &input.id,
        title,
        &input.body,
        &input.content,
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

/// Move uma nota ativa para outro pai (ou para a raiz) numa posição entre as irmãs do destino.
/// Não altera `updated_at`. Renumera as irmãs do destino e as da origem, na mesma transação.
pub fn move_note(conn: &Connection, input: MoveNote) -> Result<Note, NotesError> {
    let note = get(conn, &input.id)?;
    if note.deleted_at.is_some() {
        return Err(NotesError::InTrash);
    }

    let new_parent = input.new_parent_id.as_deref();
    ensure_active_parent(conn, new_parent)?;
    if let Some(parent) = new_parent
        && (parent == note.id
            || repository::descendants_of(conn, &note.id)?
                .iter()
                .any(|d| d == parent))
    {
        return Err(NotesError::Cycle);
    }

    let tx = conn.unchecked_transaction()?;

    // Irmãs do destino SEM a nota que está sendo movida; ela entra na posição pedida.
    let mut destination = repository::active_children_of(&tx, new_parent)?;
    destination.retain(|id| *id != note.id);
    let index = input.index.min(destination.len());
    destination.insert(index, note.id.clone());

    repository::place(&tx, &note.id, new_parent, index)?;
    for (position, id) in destination.iter().enumerate() {
        repository::set_position(&tx, id, position)?;
    }

    // Se mudou de pai, fecha a lacuna deixada na origem.
    if note.parent_id.as_deref() != new_parent {
        let origin = repository::active_children_of(&tx, note.parent_id.as_deref())?;
        for (position, id) in origin.iter().enumerate() {
            repository::set_position(&tx, id, position)?;
        }
    }

    tx.commit()?;
    get(conn, &note.id)
}

/// Manda para a lixeira a nota e TODAS as suas subpáginas ativas, juntas. Devolve os ids afetados.
/// Repetir a operação numa nota que já está na lixeira não é erro: não afeta ninguém (idempotente).
pub fn delete(conn: &Connection, id: &str) -> Result<Vec<String>, NotesError> {
    let tx = conn.unchecked_transaction()?;
    let affected = match repository::state_of(&tx, id)? {
        None => return Err(NotesError::NotFound),
        Some((_, Some(_deleted))) => Vec::new(),
        Some((_, None)) => repository::soft_delete_subtree(&tx, id)?,
    };
    tx.commit()?;
    Ok(affected)
}

/// Tira da lixeira a nota e as subpáginas que foram excluídas JUNTO com ela. Se o pai dela ainda está
/// na lixeira, ela volta para a raiz. Devolve os ids afetados. Idempotente em nota já ativa.
pub fn restore(conn: &Connection, id: &str) -> Result<Vec<String>, NotesError> {
    let note = get(conn, id)?;
    let Some(stamp) = note.deleted_at else {
        return Ok(Vec::new());
    };

    let tx = conn.unchecked_transaction()?;
    let parent_is_active = match note.parent_id.as_deref() {
        Some(parent) => matches!(repository::state_of(&tx, parent)?, Some((_, None))),
        None => false,
    };
    let new_parent = if parent_is_active {
        note.parent_id.as_deref()
    } else {
        None
    };

    repository::restore_one(&tx, id, new_parent)?;
    let mut affected = vec![id.to_string()];
    affected.extend(repository::restore_descendants(&tx, id, stamp)?);
    tx.commit()?;
    Ok(affected)
}

/// Apaga de vez a nota e toda a sua subárvore. Só vale para nota que já está na lixeira: nunca se
/// perde uma nota ativa por engano. Devolve os ids apagados.
pub fn purge(conn: &Connection, id: &str) -> Result<Vec<String>, NotesError> {
    let tx = conn.unchecked_transaction()?;
    match repository::state_of(&tx, id)? {
        None => return Err(NotesError::NotFound),
        Some((_, None)) => return Err(NotesError::NotInTrash),
        Some((_, Some(_deleted))) => {}
    }
    let purged = repository::purge_subtree(&tx, id)?;
    tx.commit()?;
    Ok(purged)
}
