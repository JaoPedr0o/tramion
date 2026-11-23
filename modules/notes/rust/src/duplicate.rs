//! Duplicar uma página: copia a página e TODA a subárvore ativa (subpáginas, e nas bases, colunas, visões e células).
//! Os links internos (subpáginas e menções a páginas copiadas) passam a apontar para as cópias; menções a páginas de fora
//! continuam apontando para as originais. A cópia vai para o fim das irmãs da original e não é favorita.

use crate::database_repository as repo;
use crate::error::NotesError;
use crate::repository;
use std::collections::HashMap;
use tramion_infra_sqlite::rusqlite::Connection;

/// Máximo de caracteres do título da cópia (o mesmo limite dos títulos).
const MAX_TITLE: usize = crate::service::MAX_TITLE_CHARS;

/// "Cópia de X", cortado no limite de caracteres.
fn copy_title(title: &str) -> String {
    format!("Cópia de {title}")
        .chars()
        .take(MAX_TITLE)
        .collect()
}

/// Troca, no texto, cada id antigo pelo novo.
fn remap(text: &str, ids: &HashMap<String, String>) -> String {
    ids.iter().fold(text.to_string(), |acc, (old, new)| {
        acc.replace(old.as_str(), new)
    })
}

/// Duplica a página `id`. Devolve os ids das páginas criadas, com a cópia da página escolhida em primeiro.
pub fn duplicate(conn: &Connection, id: &str) -> Result<Vec<String>, NotesError> {
    let tx = conn.unchecked_transaction()?;
    let root = repository::find(&tx, id)?.ok_or(NotesError::NotFound)?;
    if root.deleted_at.is_some() {
        return Err(NotesError::InTrash);
    }

    // A subárvore ativa, em largura (pais antes das filhas): (id antigo, id do pai antigo).
    let mut order: Vec<(String, Option<String>)> = vec![(id.to_string(), None)];
    let mut index = 0;
    while index < order.len() {
        let parent = order[index].0.clone();
        for child in repository::active_children_of(&tx, Some(&parent))? {
            order.push((child, Some(parent.clone())));
        }
        index += 1;
    }

    // 1) cria as cópias (vazias) e anota o par id antigo → novo.
    let mut ids: HashMap<String, String> = HashMap::new();
    let mut created = Vec::with_capacity(order.len());
    for (old_id, old_parent) in &order {
        let old = repository::find(&tx, old_id)?.ok_or(NotesError::NotFound)?;
        let (title, parent) = match old_parent {
            None => (copy_title(&old.title), old.parent_id.clone()),
            Some(parent) => (old.title.clone(), ids.get(parent).cloned()),
        };
        let new = repository::insert(&tx, &title, "", parent.as_deref())?;
        ids.insert(old_id.clone(), new.id.clone());
        created.push(new.id);
    }

    // 2) copia conteúdo, símbolo e capa, já com os links internos reapontados.
    for (old_id, _) in &order {
        let old = repository::find(&tx, old_id)?.ok_or(NotesError::NotFound)?;
        repository::copy_fields(
            &tx,
            &ids[old_id],
            &old.body,
            &remap(&old.content, &ids),
            old.icon.as_deref(),
            old.cover.as_deref(),
        )?;
    }

    // 3) bases: colunas, visões e células.
    for (old_id, _) in &order {
        if !repo::is_database(&tx, old_id)? {
            continue;
        }
        let new_db = &ids[old_id];
        repo::mark_database(&tx, new_db)?;

        let mut properties: HashMap<String, String> = HashMap::new();
        for property in repo::list_properties(&tx, old_id)? {
            let copy = repo::insert_property(
                &tx,
                new_db,
                &property.name,
                &property.kind,
                &property.options.to_string(),
            )?;
            properties.insert(property.id, copy.id);
        }
        for view in repo::list_views(&tx, old_id)? {
            repo::insert_view(
                &tx,
                new_db,
                &view.name,
                &remap(&view.config.to_string(), &properties),
            )?;
        }
        for (row, property, value) in repo::cells_of_database(&tx, old_id)? {
            if let (Some(new_row), Some(new_property)) = (ids.get(&row), properties.get(&property))
            {
                repo::upsert_cell(&tx, new_row, new_property, &value)?;
            }
        }
    }

    tx.commit()?;
    Ok(created)
}
