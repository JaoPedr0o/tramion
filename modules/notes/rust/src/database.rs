//! Regras das bases de dados: uma base é uma página marcada, as linhas são as subpáginas dela, e cada
//! coluna tem um tipo que decide quais valores as células aceitam. Valida tudo aqui, antes de gravar.
//!
//! Invariantes:
//! 1. Só linhas ATIVAS e filhas diretas da base têm células.
//! 2. O valor de uma célula sempre serve para o tipo da coluna (e opções de seleção existem na coluna).
//! 3. Célula vazia não é gravada: some.

use crate::database_repository as repo;
use crate::error::NotesError;
use crate::external::validate_external_url;
use crate::model::{DatabaseData, DatabaseRow, Note, Property};
use crate::repository;
use crate::service::{ensure_active_parent, validate_title};
use aun_infra_sqlite::rusqlite::Connection;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};

pub const MAX_PROPERTIES: usize = 50;
pub const MAX_PROPERTY_NAME_CHARS: usize = 100;
pub const MAX_OPTIONS: usize = 50;
pub const MAX_OPTION_NAME_CHARS: usize = 60;
pub const MAX_TEXT_CELL_CHARS: usize = 2000;
pub const MAX_URL_CELL_CHARS: usize = 2000;

pub const PROPERTY_KINDS: [&str; 7] = [
    "text",
    "number",
    "select",
    "multi_select",
    "date",
    "checkbox",
    "url",
];

fn has_options(kind: &str) -> bool {
    kind == "select" || kind == "multi_select"
}

fn validate_property_name(raw: &str) -> Result<&str, NotesError> {
    let name = raw.trim();
    if name.is_empty() || name.chars().count() > MAX_PROPERTY_NAME_CHARS {
        return Err(NotesError::PropertyInvalid);
    }
    Ok(name)
}

/// Opções de uma coluna de seleção: lista de `{ id, name, color }`, com ids únicos e nomes não vazios.
/// Devolve os ids (para conferir células) e o JSON limpo (só os três campos).
fn validate_options(options: &Value) -> Result<(Vec<String>, Value), NotesError> {
    let Value::Array(list) = options else {
        return Err(NotesError::PropertyInvalid);
    };
    if list.len() > MAX_OPTIONS {
        return Err(NotesError::PropertyInvalid);
    }
    let mut ids = Vec::new();
    let mut seen = HashSet::new();
    let mut clean = Vec::new();
    for item in list {
        let id = item.get("id").and_then(Value::as_str).unwrap_or("");
        let name = item
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let color = item
            .get("color")
            .and_then(Value::as_str)
            .unwrap_or("default");
        let color_ok = !color.is_empty()
            && color.len() <= 20
            && color.chars().all(|c| c.is_ascii_lowercase() || c == '-');
        let id_ok = !id.is_empty()
            && id.len() <= 64
            && id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
        if !id_ok
            || !color_ok
            || name.is_empty()
            || name.chars().count() > MAX_OPTION_NAME_CHARS
            || !seen.insert(id.to_string())
        {
            return Err(NotesError::PropertyInvalid);
        }
        ids.push(id.to_string());
        clean.push(serde_json::json!({ "id": id, "name": name, "color": color }));
    }
    Ok((ids, Value::Array(clean)))
}

fn option_ids(property: &Property) -> HashSet<String> {
    property
        .options
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|item| item.get("id").and_then(Value::as_str).map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

/// Data no formato `AAAA-MM-DD` que existe no calendário (inclusive anos bissextos).
fn is_valid_date(text: &str) -> bool {
    let parts: Vec<&str> = text.split('-').collect();
    let [year, month, day] = parts[..] else {
        return false;
    };
    if year.len() != 4 || month.len() != 2 || day.len() != 2 {
        return false;
    }
    let (Ok(year), Ok(month), Ok(day)) = (
        year.parse::<i32>(),
        month.parse::<u32>(),
        day.parse::<u32>(),
    ) else {
        return false;
    };
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days).contains(&day)
}

/// Confere o valor contra a coluna. `Ok(None)` = célula vazia (deve ser apagada); `Ok(Some(json))` = gravar.
fn normalize_cell(property: &Property, value: &Value) -> Result<Option<String>, NotesError> {
    let invalid = || NotesError::CellInvalid;
    match (property.kind.as_str(), value) {
        (_, Value::Null) => Ok(None),
        ("text", Value::String(text)) => {
            if text.is_empty() {
                Ok(None)
            } else if text.chars().count() > MAX_TEXT_CELL_CHARS {
                Err(invalid())
            } else {
                Ok(Some(value.to_string()))
            }
        }
        ("number", Value::Number(_)) => Ok(Some(value.to_string())),
        ("checkbox", Value::Bool(_)) => Ok(Some(value.to_string())),
        ("date", Value::String(text)) => {
            if text.is_empty() {
                Ok(None)
            } else if is_valid_date(text) {
                Ok(Some(value.to_string()))
            } else {
                Err(invalid())
            }
        }
        ("url", Value::String(text)) => {
            if text.is_empty() {
                Ok(None)
            } else if text.chars().count() <= MAX_URL_CELL_CHARS
                && validate_external_url(text).is_ok()
            {
                Ok(Some(value.to_string()))
            } else {
                Err(invalid())
            }
        }
        ("select", Value::String(id)) => {
            if id.is_empty() {
                Ok(None)
            } else if option_ids(property).contains(id) {
                Ok(Some(value.to_string()))
            } else {
                Err(invalid())
            }
        }
        ("multi_select", Value::Array(items)) => {
            if items.is_empty() {
                return Ok(None);
            }
            let known = option_ids(property);
            let mut seen = HashSet::new();
            for item in items {
                match item.as_str() {
                    Some(id) if known.contains(id) && seen.insert(id) => {}
                    _ => return Err(invalid()),
                }
            }
            Ok(Some(value.to_string()))
        }
        _ => Err(invalid()),
    }
}

/// A página precisa existir, estar ativa e ser uma base. Devolve o título.
fn active_database(conn: &Connection, id: &str) -> Result<String, NotesError> {
    let note = repository::find(conn, id)?.ok_or(NotesError::NotFound)?;
    if note.deleted_at.is_some() {
        return Err(NotesError::InTrash);
    }
    if !repo::is_database(conn, id)? {
        return Err(NotesError::NotDatabase);
    }
    Ok(note.title)
}

/// Cria uma base de dados (página marcada) no fim das irmãs de `parent_id` (`None` = raiz).
pub fn create_database(
    conn: &Connection,
    title: &str,
    parent_id: Option<&str>,
) -> Result<Note, NotesError> {
    let title = validate_title(title)?;
    ensure_active_parent(conn, parent_id)?;
    let tx = conn.unchecked_transaction()?;
    let note = repository::insert(&tx, title, "", parent_id)?;
    repo::mark_database(&tx, &note.id)?;
    tx.commit()?;
    Ok(note)
}

/// As colunas e as linhas ativas da base, com as células preenchidas.
pub fn get_database(conn: &Connection, id: &str) -> Result<DatabaseData, NotesError> {
    let title = active_database(conn, id)?;
    let properties = repo::list_properties(conn, id)?;

    let mut cells: BTreeMap<String, BTreeMap<String, Value>> = BTreeMap::new();
    for (note_id, property_id, raw) in repo::cells_of_database(conn, id)? {
        if let Ok(value) = serde_json::from_str::<Value>(&raw) {
            cells.entry(note_id).or_default().insert(property_id, value);
        }
    }

    let rows = repo::rows_of(conn, id)?
        .into_iter()
        .map(|(row_id, title, icon, updated_at)| DatabaseRow {
            cells: cells.remove(&row_id).unwrap_or_default(),
            id: row_id,
            title,
            icon,
            updated_at,
        })
        .collect();

    Ok(DatabaseData {
        id: id.to_string(),
        title,
        properties,
        rows,
    })
}

/// Acrescenta uma coluna no fim. O tipo não muda depois.
pub fn add_property(
    conn: &Connection,
    database_id: &str,
    name: &str,
    kind: &str,
) -> Result<Property, NotesError> {
    let name = validate_property_name(name)?;
    if !PROPERTY_KINDS.contains(&kind) {
        return Err(NotesError::PropertyInvalid);
    }
    active_database(conn, database_id)?;
    if repo::count_properties(conn, database_id)? as usize >= MAX_PROPERTIES {
        return Err(NotesError::LimitReached {
            max: MAX_PROPERTIES,
        });
    }
    Ok(repo::insert_property(conn, database_id, name, kind, "[]")?)
}

/// Renomeia a coluna e/ou troca as opções (só colunas de seleção). Opções removidas saem das células.
pub fn update_property(
    conn: &Connection,
    id: &str,
    name: Option<&str>,
    options: Option<&Value>,
) -> Result<Property, NotesError> {
    let current = repo::find_property(conn, id)?.ok_or(NotesError::PropertyNotFound)?;
    active_database(conn, &current.database_id)?;

    let name = match name {
        Some(name) => validate_property_name(name)?.to_string(),
        None => current.name.clone(),
    };
    let (new_options, kept_ids) = match options {
        Some(_) if !has_options(&current.kind) => return Err(NotesError::PropertyInvalid),
        Some(options) => {
            let (ids, clean) = validate_options(options)?;
            (clean, Some(ids))
        }
        None => (current.options.clone(), None),
    };

    let tx = conn.unchecked_transaction()?;
    let updated = repo::update_property(&tx, id, &name, &new_options.to_string())?
        .ok_or(NotesError::PropertyNotFound)?;
    if let Some(kept) = kept_ids {
        let kept: HashSet<&str> = kept.iter().map(String::as_str).collect();
        for (row_id, raw) in repo::cells_of_property(&tx, id)? {
            let Ok(value) = serde_json::from_str::<Value>(&raw) else {
                continue;
            };
            match value {
                Value::String(option) if !kept.contains(option.as_str()) => {
                    repo::delete_cell(&tx, &row_id, id)?;
                }
                Value::Array(items) => {
                    let remaining: Vec<Value> = items
                        .into_iter()
                        .filter(|item| item.as_str().is_some_and(|o| kept.contains(o)))
                        .collect();
                    if remaining.is_empty() {
                        repo::delete_cell(&tx, &row_id, id)?;
                    } else {
                        repo::upsert_cell(&tx, &row_id, id, &Value::Array(remaining).to_string())?;
                    }
                }
                _ => {}
            }
        }
    }
    tx.commit()?;
    Ok(updated)
}

/// Apaga a coluna e todos os valores dela (as linhas continuam).
pub fn delete_property(conn: &Connection, id: &str) -> Result<(), NotesError> {
    let current = repo::find_property(conn, id)?.ok_or(NotesError::PropertyNotFound)?;
    active_database(conn, &current.database_id)?;
    repo::delete_property(conn, id)?;
    Ok(())
}

/// Cria uma linha: uma subpágina nova no fim da base.
pub fn create_row(conn: &Connection, database_id: &str, title: &str) -> Result<Note, NotesError> {
    let title = validate_title(title)?;
    active_database(conn, database_id)?;
    Ok(repository::insert(conn, title, "", Some(database_id))?)
}

/// Define o valor de uma célula. Valor vazio (`null`, texto vazio, lista vazia) apaga a célula.
pub fn set_cell(
    conn: &Connection,
    note_id: &str,
    property_id: &str,
    value: &Value,
) -> Result<(), NotesError> {
    let property = repo::find_property(conn, property_id)?.ok_or(NotesError::PropertyNotFound)?;
    active_database(conn, &property.database_id)?;

    let row = repository::find(conn, note_id)?.ok_or(NotesError::NotFound)?;
    if row.deleted_at.is_some() {
        return Err(NotesError::InTrash);
    }
    if row.parent_id.as_deref() != Some(property.database_id.as_str()) {
        return Err(NotesError::CellInvalid);
    }

    match normalize_cell(&property, value)? {
        Some(json) => repo::upsert_cell(conn, note_id, property_id, &json)?,
        None => repo::delete_cell(conn, note_id, property_id)?,
    }
    Ok(())
}

/// Troca o título de uma página ativa se a versão ainda for a que o chamador viu.
pub fn rename_note(
    conn: &Connection,
    id: &str,
    title: &str,
    expected_updated_at: i64,
) -> Result<Note, NotesError> {
    let title = validate_title(title)?;
    match repository::rename_if_current(conn, id, title, expected_updated_at)? {
        Some(note) => Ok(note),
        None => Err(match repository::state_of(conn, id)? {
            None => NotesError::NotFound,
            Some((_, Some(_deleted))) => NotesError::InTrash,
            Some((current_updated_at, None)) => NotesError::Conflict { current_updated_at },
        }),
    }
}
