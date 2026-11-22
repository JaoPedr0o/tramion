//! Acesso ao SQL das notas. É o ÚNICO lugar do módulo que escreve SQL.

use crate::model::NoteSummary;
use aun_infra_sqlite::rusqlite::{Connection, Result};

/// Notas ativas (fora da lixeira): fixadas primeiro, depois as mais recentes.
pub fn list_active(conn: &Connection) -> Result<Vec<NoteSummary>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, pinned, updated_at
           FROM notes_note
          WHERE deleted_at IS NULL
          ORDER BY pinned DESC, updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(NoteSummary {
            id: row.get(0)?,
            title: row.get(1)?,
            pinned: row.get(2)?,
            updated_at: row.get(3)?,
        })
    })?;
    rows.collect()
}
