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
use crate::model::{DatabaseData, DatabaseRow, DueTask, Note, Property, View};
use crate::repository;
use crate::service::{ensure_active_parent, validate_title};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap, HashSet};
use tramion_infra_sqlite::rusqlite::Connection;

pub const MAX_PROPERTIES: usize = 50;
pub const MAX_PROPERTY_NAME_CHARS: usize = 100;
pub const MAX_OPTIONS: usize = 50;
pub const MAX_OPTION_NAME_CHARS: usize = 60;
pub const MAX_TEXT_CELL_CHARS: usize = 2000;
pub const MAX_URL_CELL_CHARS: usize = 2000;
pub const MAX_VIEWS: usize = 20;
pub const MAX_VIEW_NAME_CHARS: usize = 60;
pub const MAX_VIEW_CONFIG_BYTES: usize = 20_000;
pub const MAX_VIEW_FILTERS: usize = 20;

/// Formas de exibição aceitas numa visão.
pub const VIEW_MODES: [&str; 6] = ["table", "board", "list", "gallery", "calendar", "chart"];

/// A configuração padrão de uma visão nova ou de uma base recém-criada.
pub fn default_view_config() -> Value {
    serde_json::json!({ "mode": "table", "filters": [], "sort": null })
}

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

/// Hora no formato `HH:MM` (00:00 a 23:59).
fn is_valid_time(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() == 5
        && bytes[2] == b':'
        && bytes[..2].iter().chain(&bytes[3..]).all(u8::is_ascii_digit)
        && text[..2].parse::<u32>().is_ok_and(|hour| hour < 24)
        && text[3..].parse::<u32>().is_ok_and(|minute| minute < 60)
}

/// Valor de uma célula de data: `AAAA-MM-DD` ou, com hora local opcional, `AAAA-MM-DDTHH:MM`.
fn is_valid_date_value(text: &str) -> bool {
    match text.split_once('T') {
        None => is_valid_date(text),
        Some((date, time)) => is_valid_date(date) && is_valid_time(time),
    }
}

/// A parte da data (`AAAA-MM-DD`) de um valor de data, com ou sem hora.
fn date_part(value: &str) -> &str {
    value.get(..10).unwrap_or(value)
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
            } else if is_valid_date_value(text) {
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
    repo::insert_view(&tx, &note.id, "Tabela", &default_view_config().to_string())?;
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
        views: repo::list_views(conn, id)?,
        reminders: repo::find_reminder(conn, id)?
            .and_then(|config| serde_json::from_str::<Value>(&config).ok()),
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

// ───────── Visões salvas ─────────

fn validate_view_name(raw: &str) -> Result<&str, NotesError> {
    let name = raw.trim();
    if name.is_empty() || name.chars().count() > MAX_VIEW_NAME_CHARS {
        return Err(NotesError::ViewInvalid);
    }
    Ok(name)
}

/// Texto curto: no máximo `max` caracteres e sem caracteres de controle.
fn short_text(value: &Value, max: usize) -> Option<&str> {
    let text = value.as_str()?;
    (text.chars().count() <= max && !text.chars().any(char::is_control)).then_some(text)
}

/// Uma coluna ou nada (`null`/ausente). Não confere se a coluna existe: colunas apagadas depois são ignoradas pela tela.
fn optional_id(config: &Value, key: &str) -> Result<Value, NotesError> {
    match config.get(key) {
        None | Some(Value::Null) => Ok(Value::Null),
        Some(value) => short_text(value, 64)
            .map(|text| Value::String(text.to_string()))
            .ok_or(NotesError::ViewInvalid),
    }
}

/// Confere a configuração e a devolve LIMPA (só os campos conhecidos): forma de exibição, filtros, ordenação,
/// coluna de agrupamento (quadro), coluna de data e escala (calendário).
pub fn validate_view_config(config: &Value) -> Result<Value, NotesError> {
    let Value::Object(object) = config else {
        return Err(NotesError::ViewInvalid);
    };
    if config.to_string().len() > MAX_VIEW_CONFIG_BYTES {
        return Err(NotesError::ViewInvalid);
    }

    let mode = object
        .get("mode")
        .and_then(Value::as_str)
        .filter(|mode| VIEW_MODES.contains(mode))
        .ok_or(NotesError::ViewInvalid)?;

    let filters = match object.get("filters") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(list)) if list.len() <= MAX_VIEW_FILTERS => list
            .iter()
            .map(|item| {
                let field = |key: &str| {
                    item.get(key)
                        .and_then(|v| short_text(v, 500))
                        .map(str::to_string)
                        .ok_or(NotesError::ViewInvalid)
                };
                Ok(serde_json::json!({
                    "property": field("property")?,
                    "operator": field("operator")?,
                    "value": field("value")?,
                }))
            })
            .collect::<Result<Vec<_>, NotesError>>()?,
        Some(_) => return Err(NotesError::ViewInvalid),
    };

    let sort = match object.get("sort") {
        None | Some(Value::Null) => Value::Null,
        Some(sort) => {
            let direction = sort
                .get("direction")
                .and_then(Value::as_str)
                .filter(|d| *d == "asc" || *d == "desc")
                .ok_or(NotesError::ViewInvalid)?;
            let property = sort
                .get("property")
                .and_then(|v| short_text(v, 64))
                .ok_or(NotesError::ViewInvalid)?;
            serde_json::json!({ "property": property, "direction": direction })
        }
    };

    let scale = match object.get("scale") {
        None | Some(Value::Null) => Value::Null,
        Some(Value::String(scale)) if scale == "month" || scale == "week" => {
            Value::String(scale.clone())
        }
        Some(_) => return Err(NotesError::ViewInvalid),
    };

    Ok(serde_json::json!({
        "mode": mode,
        "filters": filters,
        "sort": sort,
        "groupBy": optional_id(config, "groupBy")?,
        "dateProperty": optional_id(config, "dateProperty")?,
        "valueProperty": optional_id(config, "valueProperty")?,
        "scale": scale,
    }))
}

/// Acrescenta uma visão no fim.
pub fn add_view(
    conn: &Connection,
    database_id: &str,
    name: &str,
    config: &Value,
) -> Result<View, NotesError> {
    let name = validate_view_name(name)?;
    let clean = validate_view_config(config)?;
    active_database(conn, database_id)?;
    if repo::count_views(conn, database_id)? as usize >= MAX_VIEWS {
        return Err(NotesError::LimitReached { max: MAX_VIEWS });
    }
    Ok(repo::insert_view(
        conn,
        database_id,
        name,
        &clean.to_string(),
    )?)
}

/// Renomeia a visão e/ou troca a configuração (o que estiver ausente fica como está).
pub fn update_view(
    conn: &Connection,
    id: &str,
    name: Option<&str>,
    config: Option<&Value>,
) -> Result<View, NotesError> {
    let current = repo::find_view(conn, id)?.ok_or(NotesError::ViewNotFound)?;
    active_database(conn, &current.database_id)?;
    let name = match name {
        Some(name) => validate_view_name(name)?.to_string(),
        None => current.name.clone(),
    };
    let config = match config {
        Some(config) => validate_view_config(config)?,
        None => current.config.clone(),
    };
    repo::update_view(conn, id, &name, &config.to_string())?.ok_or(NotesError::ViewNotFound)
}

/// Apaga a visão. A última visão de uma base não pode ser apagada (a base sempre tem uma forma de ser vista).
pub fn delete_view(conn: &Connection, id: &str) -> Result<(), NotesError> {
    let current = repo::find_view(conn, id)?.ok_or(NotesError::ViewNotFound)?;
    active_database(conn, &current.database_id)?;
    if repo::count_views(conn, &current.database_id)? <= 1 {
        return Err(NotesError::ViewInvalid);
    }
    repo::delete_view(conn, id)?;
    Ok(())
}

// ───────── Lembretes de tarefas ─────────

/// Confere a configuração dos lembretes de uma base e a devolve LIMPA:
/// `{ enabled, dateProperty, doneProperty, doneOption }`.
///
/// - `dateProperty` é obrigatória e precisa ser uma coluna de DATA da base.
/// - `doneProperty` (opcional) é uma coluna de caixa de seleção (marcada = concluída) ou de seleção (a opção
///   `doneOption` = concluída; a opção é obrigatória e precisa existir na coluna).
pub fn validate_reminders(
    conn: &Connection,
    database_id: &str,
    config: &Value,
) -> Result<Value, NotesError> {
    let Value::Object(object) = config else {
        return Err(NotesError::PropertyInvalid);
    };
    let enabled = object
        .get("enabled")
        .and_then(Value::as_bool)
        .ok_or(NotesError::PropertyInvalid)?;
    let own = |key: &str| -> Result<Option<Property>, NotesError> {
        match object.get(key) {
            None | Some(Value::Null) => Ok(None),
            Some(Value::String(id)) => repo::find_property(conn, id)?
                .filter(|p| p.database_id == database_id)
                .map(Some)
                .ok_or(NotesError::PropertyInvalid),
            Some(_) => Err(NotesError::PropertyInvalid),
        }
    };

    let date = own("dateProperty")?
        .filter(|p| p.kind == "date")
        .ok_or(NotesError::PropertyInvalid)?;
    let done = own("doneProperty")?;
    let mut done_option = Value::Null;
    if let Some(done) = &done {
        match done.kind.as_str() {
            "checkbox" => {}
            "select" => {
                let option = object
                    .get("doneOption")
                    .and_then(Value::as_str)
                    .ok_or(NotesError::PropertyInvalid)?;
                if !option_ids(done).contains(option) {
                    return Err(NotesError::PropertyInvalid);
                }
                done_option = Value::String(option.to_string());
            }
            _ => return Err(NotesError::PropertyInvalid),
        }
    }

    Ok(serde_json::json!({
        "enabled": enabled,
        "dateProperty": date.id,
        "doneProperty": done.map(|p| p.id),
        "doneOption": done_option,
    }))
}

/// Liga, troca ou desliga (`None`) os lembretes de tarefas de uma base.
pub fn set_reminders(
    conn: &Connection,
    database_id: &str,
    config: Option<&Value>,
) -> Result<Option<Value>, NotesError> {
    active_database(conn, database_id)?;
    match config {
        None => {
            repo::delete_reminder(conn, database_id)?;
            Ok(None)
        }
        Some(config) => {
            let clean = validate_reminders(conn, database_id, config)?;
            repo::upsert_reminder(conn, database_id, &clean.to_string())?;
            Ok(Some(clean))
        }
    }
}

/// A data é `AAAA-MM-DD` válida? (Mesma regra das células de data.)
fn is_iso_date(text: &str) -> bool {
    text.len() == 10 && is_valid_date(text)
}

/// Varre as bases com lembretes ligados e devolve as tarefas NÃO concluídas cujo prazo passa em `accept`; `overdue`
/// diz se o prazo conta como atrasado. Mais antigas primeiro.
fn scan_tasks(
    conn: &Connection,
    accept: impl Fn(&str) -> bool,
    overdue: impl Fn(&str) -> bool,
) -> Result<Vec<DueTask>, NotesError> {
    let mut found: Vec<DueTask> = Vec::new();
    for (database_id, database_title, raw) in repo::list_active_reminders(conn)? {
        let Ok(config) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        if config.get("enabled").and_then(Value::as_bool) != Some(true) {
            continue;
        }
        let Some(date_property) = config.get("dateProperty").and_then(Value::as_str) else {
            continue;
        };
        let done_property = config.get("doneProperty").and_then(Value::as_str);
        let done_option = config.get("doneOption").and_then(Value::as_str);

        let value_of = |property: &str| -> Result<HashMap<String, Value>, NotesError> {
            Ok(repo::cells_of_property(conn, property)?
                .into_iter()
                .filter_map(|(row, raw)| Some((row, serde_json::from_str::<Value>(&raw).ok()?)))
                .collect())
        };
        let dates = value_of(date_property)?;
        let done = match done_property {
            Some(property) => value_of(property)?,
            None => HashMap::new(),
        };

        for (row_id, title, icon, _) in repo::rows_of(conn, &database_id)? {
            let Some(date) = dates.get(&row_id).and_then(Value::as_str) else {
                continue;
            };
            // O prazo pode ter hora (`AAAA-MM-DDTHH:MM`): as janelas contam por dia, então comparam só a data.
            if !accept(date_part(date)) {
                continue;
            }
            let finished = match (done.get(&row_id), done_option) {
                (Some(Value::Bool(true)), None) => true,
                (Some(Value::String(chosen)), Some(option)) => chosen == option,
                _ => false,
            };
            if finished {
                continue;
            }
            found.push(DueTask {
                id: row_id,
                title,
                icon,
                database_id: database_id.clone(),
                database_title: database_title.clone(),
                date: date.to_string(),
                overdue: overdue(date_part(date)),
            });
        }
    }
    found.sort_by(|a, b| {
        a.date
            .cmp(&b.date)
            .then(a.title.cmp(&b.title))
            .then(a.id.cmp(&b.id))
    });
    Ok(found)
}

/// As tarefas que pedem atenção em `today` (`AAAA-MM-DD`, no relógio do usuário): linhas de bases com lembretes
/// ligados cujo prazo é hoje ou já passou e que ainda não foram concluídas. Mais antigas primeiro.
pub fn due_tasks(conn: &Connection, today: &str) -> Result<Vec<DueTask>, NotesError> {
    if !is_iso_date(today) {
        return Err(NotesError::CellInvalid);
    }
    scan_tasks(conn, |date| date <= today, |date| date < today)
}

/// Máximo de dias à frente na agenda.
pub const MAX_AGENDA_DAYS: i64 = 60;

/// As tarefas não concluídas com prazo DEPOIS de hoje e até `days` dias à frente (de 1 a 60), de bases com lembretes
/// ligados. Mais próximas primeiro.
pub fn upcoming_tasks(
    conn: &Connection,
    today: &str,
    days: i64,
) -> Result<Vec<DueTask>, NotesError> {
    if !is_iso_date(today) {
        return Err(NotesError::CellInvalid);
    }
    let days = days.clamp(1, MAX_AGENDA_DAYS);
    let end: String = conn.query_row(
        "SELECT date(?1, ?2)",
        [today, &format!("+{days} days")],
        |row| row.get(0),
    )?;
    scan_tasks(conn, |date| date > today && date <= end.as_str(), |_| false)
}
