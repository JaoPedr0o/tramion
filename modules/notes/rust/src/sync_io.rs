//! Ponte entre o banco e o motor de sincronização (ADR 0020): lê os registros no formato do motor e aplica os que
//! chegam de outro aparelho.

use crate::error::NotesError;
use serde_json::{Value, json};
use tramion_infra_sqlite::rusqlite::{Connection, OptionalExtension, params};
use tramion_sync::Record;

/// Ordem de aplicação: quem é referenciado vem antes de quem referencia.
const KINDS: [&str; 5] = ["note", "property", "cell", "view", "template"];

/// O id deste aparelho; criado (aleatório) na primeira vez e guardado para sempre.
pub fn device_id(conn: &Connection) -> Result<String, NotesError> {
    if let Some(id) = conn
        .query_row(
            "SELECT value FROM notes_meta WHERE key = 'device_id'",
            [],
            |r| r.get(0),
        )
        .optional()?
    {
        return Ok(id);
    }
    let id: String = conn.query_row("SELECT lower(hex(randomblob(8)))", [], |r| r.get(0))?;
    conn.execute(
        "INSERT INTO notes_meta (key, value) VALUES ('device_id', ?1)",
        [&id],
    )?;
    Ok(id)
}

fn payload(conn: &Connection, kind: &str, id: &str) -> Result<Option<Value>, NotesError> {
    let json_of = |sql: &str, args: &[&str]| -> Result<Option<Value>, NotesError> {
        Ok(conn
            .query_row(
                sql,
                tramion_infra_sqlite::rusqlite::params_from_iter(args),
                |r| r.get::<_, String>(0),
            )
            .optional()?
            .map(|s| serde_json::from_str(&s).unwrap_or(Value::Null)))
    };
    match kind {
        "note" => json_of(
            "SELECT json_object('title', title, 'body', body, 'pinned', pinned, 'createdAt', created_at,
                    'updatedAt', updated_at, 'deletedAt', deleted_at, 'parentId', parent_id, 'position', position,
                    'content', json(content), 'icon', icon, 'cover', cover,
                    'isDatabase', EXISTS (SELECT 1 FROM notes_database d WHERE d.note_id = notes_note.id))
             FROM notes_note WHERE id = ?1",
            &[id],
        ),
        "property" => json_of(
            "SELECT json_object('databaseId', database_id, 'name', name, 'kind', kind,
                    'options', json(options), 'position', position)
             FROM notes_property WHERE id = ?1",
            &[id],
        ),
        "cell" => {
            let Some((note, prop)) = id.split_once(':') else { return Ok(None) };
            json_of(
                "SELECT json_object('noteId', note_id, 'propertyId', property_id, 'value', json(value))
                 FROM notes_cell WHERE note_id = ?1 AND property_id = ?2",
                &[note, prop],
            )
        }
        "view" => json_of(
            "SELECT json_object('databaseId', database_id, 'name', name, 'config', json(config), 'position', position)
             FROM notes_view WHERE id = ?1",
            &[id],
        ),
        "template" => json_of(
            "SELECT json_object('name', name, 'icon', icon, 'body', body, 'content', json(content),
                    'createdAt', created_at)
             FROM notes_user_template WHERE id = ?1",
            &[id],
        ),
        _ => Ok(None),
    }
}

/// Todos os registros sincronizáveis (inclusive lápides), no formato do motor.
pub fn export_records(conn: &Connection) -> Result<Vec<Record>, NotesError> {
    let mut stmt = conn.prepare(
        "SELECT kind, id, updated_at, device, deleted FROM notes_sync_state ORDER BY kind, id",
    )?;
    let rows: Vec<(String, String, i64, String, bool)> = stmt
        .query_map([], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        })?
        .collect::<Result<_, _>>()?;
    let mut out = Vec::new();
    for (kind, id, updated_at, device, deleted) in rows {
        let body = if deleted {
            Some(Value::Null)
        } else {
            payload(conn, &kind, &id)?
        };
        // Estado sem linha (não deveria acontecer): ignora em vez de exportar lixo.
        let Some(body) = body else { continue };
        out.push(Record {
            id,
            kind,
            updated_at,
            device,
            deleted,
            payload: body,
        });
    }
    Ok(out)
}

fn text<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}
fn int(v: &Value, key: &str) -> Option<i64> {
    v.get(key).and_then(Value::as_i64)
}
fn raw(v: &Value, key: &str) -> String {
    v.get(key).map_or_else(|| "null".into(), Value::to_string)
}

fn exists(conn: &Connection, table: &str, col: &str, id: &str) -> Result<bool, NotesError> {
    Ok(conn
        .query_row(
            &format!("SELECT 1 FROM {table} WHERE {col} = ?1"),
            [id],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

fn apply_one(conn: &Connection, r: &Record) -> Result<(), NotesError> {
    let p = &r.payload;
    if r.deleted {
        match r.kind.as_str() {
            "note" => conn.execute("DELETE FROM notes_note WHERE id = ?1", [&r.id])?,
            "property" => conn.execute("DELETE FROM notes_property WHERE id = ?1", [&r.id])?,
            "view" => conn.execute("DELETE FROM notes_view WHERE id = ?1", [&r.id])?,
            "template" => conn.execute("DELETE FROM notes_user_template WHERE id = ?1", [&r.id])?,
            "cell" => match r.id.split_once(':') {
                Some((n, pr)) => conn.execute(
                    "DELETE FROM notes_cell WHERE note_id = ?1 AND property_id = ?2",
                    [n, pr],
                )?,
                None => 0,
            },
            _ => 0,
        };
        return Ok(());
    }
    match r.kind.as_str() {
        "note" => {
            let parent = text(p, "parentId").filter(|id| *id != r.id);
            conn.execute(
                "INSERT INTO notes_note (id, title, body, pinned, created_at, updated_at, deleted_at, parent_id,
                        position, content, icon, cover)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                 ON CONFLICT (id) DO UPDATE SET title = excluded.title, body = excluded.body, pinned = excluded.pinned,
                    updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, parent_id = excluded.parent_id,
                    position = excluded.position, content = excluded.content, icon = excluded.icon,
                    cover = excluded.cover",
                params![
                    r.id,
                    text(p, "title").unwrap_or("Sem título"),
                    text(p, "body").unwrap_or(""),
                    int(p, "pinned").unwrap_or(0),
                    int(p, "createdAt").unwrap_or(r.updated_at),
                    int(p, "updatedAt").unwrap_or(r.updated_at),
                    int(p, "deletedAt"),
                    parent,
                    int(p, "position").unwrap_or(0),
                    raw(p, "content"),
                    text(p, "icon"),
                    text(p, "cover"),
                ],
            )?;
            if int(p, "isDatabase") == Some(1) {
                conn.execute(
                    "INSERT OR IGNORE INTO notes_database (note_id) VALUES (?1)",
                    [&r.id],
                )?;
            }
        }
        "property" => {
            let db = text(p, "databaseId").unwrap_or_default();
            if exists(conn, "notes_database", "note_id", db)? {
                conn.execute(
                    "INSERT INTO notes_property (id, database_id, name, kind, options, position)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                     ON CONFLICT (id) DO UPDATE SET name = excluded.name, kind = excluded.kind,
                        options = excluded.options, position = excluded.position",
                    params![
                        r.id,
                        db,
                        text(p, "name"),
                        text(p, "kind"),
                        raw(p, "options"),
                        int(p, "position")
                    ],
                )?;
            }
        }
        "cell" => {
            let (n, pr) = (
                text(p, "noteId").unwrap_or_default(),
                text(p, "propertyId").unwrap_or_default(),
            );
            if exists(conn, "notes_note", "id", n)? && exists(conn, "notes_property", "id", pr)? {
                conn.execute(
                    "INSERT INTO notes_cell (note_id, property_id, value) VALUES (?1, ?2, ?3)
                     ON CONFLICT (note_id, property_id) DO UPDATE SET value = excluded.value",
                    params![n, pr, raw(p, "value")],
                )?;
            }
        }
        "view" => {
            let db = text(p, "databaseId").unwrap_or_default();
            if exists(conn, "notes_database", "note_id", db)? {
                conn.execute(
                    "INSERT INTO notes_view (id, database_id, name, config, position) VALUES (?1, ?2, ?3, ?4, ?5)
                     ON CONFLICT (id) DO UPDATE SET name = excluded.name, config = excluded.config,
                        position = excluded.position",
                    params![r.id, db, text(p, "name"), raw(p, "config"), int(p, "position")],
                )?;
            }
        }
        "template" => {
            conn.execute(
                "INSERT INTO notes_user_template (id, name, icon, body, content, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT (id) DO UPDATE SET name = excluded.name, icon = excluded.icon, body = excluded.body,
                    content = excluded.content",
                params![
                    r.id,
                    text(p, "name"),
                    text(p, "icon"),
                    text(p, "body"),
                    raw(p, "content"),
                    int(p, "createdAt").unwrap_or(r.updated_at)
                ],
            )?;
        }
        _ => {}
    }
    Ok(())
}

/// Aplica registros vindos de outro aparelho, numa transação só: ou tudo entra ou nada. Os gatilhos ficam desligados
/// e o estado de cada registro é gravado com a hora e o aparelho de ORIGEM (não com os daqui). Registros de tipo
/// desconhecido são ignorados; os que dependem de algo que não existe mais (célula sem coluna) são pulados.
pub fn apply_records(conn: &mut Connection, records: &[Record]) -> Result<usize, NotesError> {
    let tx = conn.transaction()?;
    tx.execute_batch("PRAGMA defer_foreign_keys = ON")?;
    tx.execute(
        "INSERT OR REPLACE INTO notes_meta (key, value) VALUES ('sync_applying', '1')",
        [],
    )?;
    let mut applied = 0;
    for kind in KINDS {
        for r in records.iter().filter(|r| r.kind == kind) {
            apply_one(&tx, r)?;
            tx.execute(
                "INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted) VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT (kind, id) DO UPDATE SET updated_at = excluded.updated_at, device = excluded.device,
                    deleted = excluded.deleted",
                params![r.kind, r.id, r.updated_at, r.device, r.deleted],
            )?;
            applied += 1;
        }
    }
    tx.execute("DELETE FROM notes_meta WHERE key = 'sync_applying'", [])?;
    tx.commit()?;
    Ok(applied)
}

/// Um resumo do que o aparelho tem, só para diagnóstico.
pub fn summary(conn: &Connection) -> Result<Value, NotesError> {
    let count = |k: &str| -> Result<i64, NotesError> {
        Ok(conn.query_row(
            "SELECT COUNT(*) FROM notes_sync_state WHERE kind = ?1 AND deleted = 0",
            [k],
            |r| r.get(0),
        )?)
    };
    Ok(json!({ "notes": count("note")?, "cells": count("cell")? }))
}
