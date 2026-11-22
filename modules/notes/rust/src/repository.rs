//! Acesso ao SQL das notas. É o ÚNICO lugar do módulo que escreve SQL.
//! Aqui não há regras de negócio (validação, conflitos, ciclos): só consultas e atualizações.
//! As operações com várias instruções são juntadas numa transação pelo serviço.

use crate::model::{Note, NoteSummary};
use aun_infra_sqlite::rusqlite::{Connection, OptionalExtension, Result, Row, params};

/// Instante atual em milissegundos, calculado pelo próprio SQLite.
const NOW_MS: &str = "CAST(unixepoch('subsec') * 1000 AS INTEGER)";

const NOTE_COLUMNS: &str =
    "id, title, body, pinned, created_at, updated_at, deleted_at, parent_id, position";

/// Todas as descendentes (filhas, netas...) de `?1`, sem incluir `?1`. Usa `UNION` (e não `UNION ALL`)
/// para terminar mesmo que, por algum defeito, existisse um ciclo nos dados.
const DESCENDANTS_CTE: &str = "WITH RECURSIVE sub(id) AS (
        SELECT id FROM notes_note WHERE parent_id = ?1
        UNION
        SELECT n.id FROM notes_note n JOIN sub ON n.parent_id = sub.id
    )";

fn note_from_row(row: &Row<'_>) -> Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        title: row.get(1)?,
        body: row.get(2)?,
        pinned: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        deleted_at: row.get(6)?,
        parent_id: row.get(7)?,
        position: row.get(8)?,
    })
}

fn summary_from_row(row: &Row<'_>) -> Result<NoteSummary> {
    Ok(NoteSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        pinned: row.get(2)?,
        updated_at: row.get(3)?,
        deleted_at: row.get(4)?,
        parent_id: row.get(5)?,
        position: row.get(6)?,
    })
}

/// Cria a nota no FIM das irmãs ativas do mesmo pai (`parent_id` `None` = raiz).
pub fn insert(conn: &Connection, title: &str, body: &str, parent_id: Option<&str>) -> Result<Note> {
    conn.query_row(
        &format!(
            "INSERT INTO notes_note (title, body, parent_id, position)
             VALUES (?1, ?2, ?3,
                     (SELECT COALESCE(MAX(position) + 1, 0) FROM notes_note
                       WHERE parent_id IS ?3 AND deleted_at IS NULL))
          RETURNING {NOTE_COLUMNS}"
        ),
        params![title, body, parent_id],
        note_from_row,
    )
}

/// Busca por id, esteja a nota ativa ou na lixeira.
pub fn find(conn: &Connection, id: &str) -> Result<Option<Note>> {
    conn.query_row(
        &format!("SELECT {NOTE_COLUMNS} FROM notes_note WHERE id = ?1"),
        [id],
        note_from_row,
    )
    .optional()
}

/// Notas ativas, PLANAS, agrupadas por pai e ordenadas por posição. A árvore é montada pelo cliente.
pub fn list_active(conn: &Connection) -> Result<Vec<NoteSummary>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, pinned, updated_at, deleted_at, parent_id, position
           FROM notes_note
          WHERE deleted_at IS NULL
          ORDER BY parent_id IS NOT NULL, parent_id, position, created_at, id",
    )?;
    stmt.query_map([], summary_from_row)?.collect()
}

/// Linha crua da lixeira: `(id, título, pai, instante da exclusão)`. O serviço decide quais são raízes.
pub type TrashedRow = (String, String, Option<String>, i64);

/// Todas as notas na lixeira, as excluídas há menos tempo primeiro.
pub fn list_trashed_rows(conn: &Connection) -> Result<Vec<TrashedRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, parent_id, deleted_at
           FROM notes_note
          WHERE deleted_at IS NOT NULL
          ORDER BY deleted_at DESC, id",
    )?;
    stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    })?
    .collect()
}

/// `(updated_at, deleted_at)` da nota, ou `None` se ela não existe. Usado para explicar por que
/// uma atualização não atingiu nenhuma linha.
pub fn state_of(conn: &Connection, id: &str) -> Result<Option<(i64, Option<i64>)>> {
    conn.query_row(
        "SELECT updated_at, deleted_at FROM notes_note WHERE id = ?1",
        [id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
}

/// Ids de todas as descendentes de `id` (ativas ou na lixeira), sem incluir o próprio `id`.
pub fn descendants_of(conn: &Connection, id: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(&format!("{DESCENDANTS_CTE} SELECT id FROM sub"))?;
    stmt.query_map([id], |row| row.get(0))?.collect()
}

/// Ids das irmãs ATIVAS de um pai (`None` = raiz), na ordem das posições.
pub fn active_children_of(conn: &Connection, parent_id: Option<&str>) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT id FROM notes_note
          WHERE parent_id IS ?1 AND deleted_at IS NULL
          ORDER BY position, created_at, id",
    )?;
    stmt.query_map([parent_id], |row| row.get(0))?.collect()
}

/// Define pai e posição de uma nota.
pub fn place(conn: &Connection, id: &str, parent_id: Option<&str>, position: usize) -> Result<()> {
    conn.execute(
        "UPDATE notes_note SET parent_id = ?2, position = ?3 WHERE id = ?1",
        params![id, parent_id, position as i64],
    )?;
    Ok(())
}

/// Define só a posição (o pai não muda).
pub fn set_position(conn: &Connection, id: &str, position: usize) -> Result<()> {
    conn.execute(
        "UPDATE notes_note SET position = ?2 WHERE id = ?1",
        params![id, position as i64],
    )?;
    Ok(())
}

/// Edita título e corpo SE a nota ainda estiver na versão `expected_updated_at` e ativa.
/// Devolve `None` se nenhuma linha foi atingida.
///
/// O novo `updated_at` é `max(agora, anterior + 1)`: precisa SEMPRE aumentar, mesmo que duas
/// edições caiam no mesmo milissegundo. Se repetisse o valor, a verificação de conflito deixaria
/// passar uma edição baseada numa versão velha.
pub fn update_if_current(
    conn: &Connection,
    id: &str,
    title: &str,
    body: &str,
    expected_updated_at: i64,
) -> Result<Option<Note>> {
    conn.query_row(
        &format!(
            "UPDATE notes_note
                SET title = ?2, body = ?3, updated_at = max({NOW_MS}, updated_at + 1)
              WHERE id = ?1 AND updated_at = ?4 AND deleted_at IS NULL
          RETURNING {NOTE_COLUMNS}"
        ),
        params![id, title, body, expected_updated_at],
        note_from_row,
    )
    .optional()
}

/// Fixa ou desafixa uma nota ativa. Não mexe em `updated_at`: organizar não é editar o conteúdo
/// (e não deve causar conflito em quem está com a nota aberta).
pub fn set_pinned(conn: &Connection, id: &str, pinned: bool) -> Result<Option<Note>> {
    conn.query_row(
        &format!(
            "UPDATE notes_note SET pinned = ?2
              WHERE id = ?1 AND deleted_at IS NULL
          RETURNING {NOTE_COLUMNS}"
        ),
        params![id, pinned],
        note_from_row,
    )
    .optional()
}

/// Manda para a lixeira a nota `id` e todas as descendentes AINDA ATIVAS, com o MESMO instante.
/// Devolve os ids afetados. Descendentes que já estavam na lixeira não são tocadas.
///
/// O instante é `max(agora, maior instante anterior + 1)`: dois instantes de exclusão nunca são
/// iguais. É isso que permite restaurar "só o que foi excluído junto" sem confundir exclusões.
pub fn soft_delete_subtree(conn: &Connection, id: &str) -> Result<Vec<String>> {
    let stamp: i64 = conn.query_row(
        &format!("SELECT max({NOW_MS}, COALESCE((SELECT MAX(deleted_at) FROM notes_note), 0) + 1)"),
        [],
        |row| row.get(0),
    )?;
    let mut stmt = conn.prepare(
        "WITH RECURSIVE sub(id) AS (
             SELECT ?1
             UNION
             SELECT n.id FROM notes_note n JOIN sub ON n.parent_id = sub.id
         )
         UPDATE notes_note SET deleted_at = ?2
          WHERE id IN (SELECT id FROM sub) AND deleted_at IS NULL
      RETURNING id",
    )?;
    stmt.query_map(params![id, stamp], |row| row.get(0))?
        .collect()
}

/// Tira UMA nota da lixeira, ligando-a a `parent_id` (ou à raiz) no FIM das irmãs.
pub fn restore_one(conn: &Connection, id: &str, parent_id: Option<&str>) -> Result<()> {
    conn.execute(
        "UPDATE notes_note
            SET deleted_at = NULL,
                parent_id = ?2,
                position = (SELECT COALESCE(MAX(position) + 1, 0) FROM notes_note
                             WHERE parent_id IS ?2 AND deleted_at IS NULL)
          WHERE id = ?1",
        params![id, parent_id],
    )?;
    Ok(())
}

/// Tira da lixeira as descendentes de `id` excluídas JUNTO com ele (mesmo instante `stamp`).
/// Descendentes excluídas em outra ocasião (instante diferente) continuam na lixeira.
pub fn restore_descendants(conn: &Connection, id: &str, stamp: i64) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "WITH RECURSIVE sub(id) AS (
             SELECT id FROM notes_note WHERE parent_id = ?1 AND deleted_at = ?2
             UNION
             SELECT n.id FROM notes_note n JOIN sub ON n.parent_id = sub.id
              WHERE n.deleted_at = ?2
         )
         UPDATE notes_note SET deleted_at = NULL
          WHERE id IN (SELECT id FROM sub)
      RETURNING id",
    )?;
    stmt.query_map(params![id, stamp], |row| row.get(0))?
        .collect()
}

/// Apaga DE VEZ a nota `id` e as descendentes, mas só as que estão na lixeira. Devolve os ids apagados.
/// Se sobrar uma descendente ativa, a chave estrangeira recusa tudo (rede de segurança).
pub fn purge_subtree(conn: &Connection, id: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "WITH RECURSIVE sub(id) AS (
             SELECT ?1
             UNION
             SELECT n.id FROM notes_note n JOIN sub ON n.parent_id = sub.id
         )
         DELETE FROM notes_note
          WHERE id IN (SELECT id FROM sub) AND deleted_at IS NOT NULL
      RETURNING id",
    )?;
    stmt.query_map([id], |row| row.get(0))?.collect()
}
