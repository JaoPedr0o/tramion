//! SQL das bases de dados (colunas e células). Sem regras de negócio: quem valida é `database.rs`.

use crate::model::Property;
use aesthetic_infra_sqlite::rusqlite::{Connection, OptionalExtension, Result, Row, params};

/// Linha crua da base: `(id, título, símbolo, versão)`.
pub type RowSummary = (String, String, Option<String>, i64);

const PROPERTY_COLUMNS: &str = "id, database_id, name, kind, options, position";

fn property_from_row(row: &Row<'_>) -> Result<Property> {
    let options: String = row.get(4)?;
    Ok(Property {
        id: row.get(0)?,
        database_id: row.get(1)?,
        name: row.get(2)?,
        kind: row.get(3)?,
        // O `CHECK (json_valid(...))` da migração garante que isto é JSON.
        options: serde_json::from_str(&options).unwrap_or(serde_json::Value::Array(Vec::new())),
        position: row.get(5)?,
    })
}

pub fn mark_database(conn: &Connection, note_id: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO notes_database (note_id) VALUES (?1)",
        [note_id],
    )?;
    Ok(())
}

pub fn is_database(conn: &Connection, note_id: &str) -> Result<bool> {
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM notes_database WHERE note_id = ?1)",
        [note_id],
        |row| row.get(0),
    )
}

pub fn insert_property(
    conn: &Connection,
    database_id: &str,
    name: &str,
    kind: &str,
    options: &str,
) -> Result<Property> {
    conn.query_row(
        &format!(
            "INSERT INTO notes_property (database_id, name, kind, options, position)
             VALUES (?1, ?2, ?3, ?4,
                     (SELECT COALESCE(MAX(position) + 1, 0) FROM notes_property WHERE database_id = ?1))
          RETURNING {PROPERTY_COLUMNS}"
        ),
        params![database_id, name, kind, options],
        property_from_row,
    )
}

pub fn find_property(conn: &Connection, id: &str) -> Result<Option<Property>> {
    conn.query_row(
        &format!("SELECT {PROPERTY_COLUMNS} FROM notes_property WHERE id = ?1"),
        [id],
        property_from_row,
    )
    .optional()
}

pub fn list_properties(conn: &Connection, database_id: &str) -> Result<Vec<Property>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {PROPERTY_COLUMNS} FROM notes_property WHERE database_id = ?1 ORDER BY position, id"
    ))?;
    stmt.query_map([database_id], property_from_row)?.collect()
}

pub fn count_properties(conn: &Connection, database_id: &str) -> Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM notes_property WHERE database_id = ?1",
        [database_id],
        |row| row.get(0),
    )
}

pub fn update_property(
    conn: &Connection,
    id: &str,
    name: &str,
    options: &str,
) -> Result<Option<Property>> {
    conn.query_row(
        &format!(
            "UPDATE notes_property SET name = ?2, options = ?3 WHERE id = ?1
          RETURNING {PROPERTY_COLUMNS}"
        ),
        params![id, name, options],
        property_from_row,
    )
    .optional()
}

pub fn delete_property(conn: &Connection, id: &str) -> Result<usize> {
    conn.execute("DELETE FROM notes_property WHERE id = ?1", [id])
}

pub fn upsert_cell(conn: &Connection, note_id: &str, property_id: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO notes_cell (note_id, property_id, value) VALUES (?1, ?2, ?3)
         ON CONFLICT (note_id, property_id) DO UPDATE SET value = excluded.value",
        params![note_id, property_id, value],
    )?;
    Ok(())
}

pub fn delete_cell(conn: &Connection, note_id: &str, property_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM notes_cell WHERE note_id = ?1 AND property_id = ?2",
        params![note_id, property_id],
    )?;
    Ok(())
}

/// Células de uma coluna: `(id da linha, valor em JSON)`.
pub fn cells_of_property(conn: &Connection, property_id: &str) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare("SELECT note_id, value FROM notes_cell WHERE property_id = ?1")?;
    stmt.query_map([property_id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect()
}

/// Células de todas as colunas da base: `(id da linha, id da coluna, valor em JSON)`.
pub fn cells_of_database(
    conn: &Connection,
    database_id: &str,
) -> Result<Vec<(String, String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT c.note_id, c.property_id, c.value
           FROM notes_cell c JOIN notes_property p ON p.id = c.property_id
          WHERE p.database_id = ?1",
    )?;
    stmt.query_map([database_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    })?
    .collect()
}

/// Linhas ativas da base (subpáginas diretas): `(id, título, símbolo, versão)`, na ordem da página.
pub fn rows_of(conn: &Connection, database_id: &str) -> Result<Vec<RowSummary>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, icon, updated_at FROM notes_note
          WHERE parent_id = ?1 AND deleted_at IS NULL
          ORDER BY position, created_at, id",
    )?;
    stmt.query_map([database_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    })?
    .collect()
}
