//! Ligações entre páginas: menções (`@página`) e subpáginas dentro do texto. Daqui saem os "backlinks" (quem menciona
//! esta página) e o grafo de conexões. Tudo é calculado sob demanda a partir do conteúdo das páginas ativas.

use crate::error::NotesError;
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use tramion_infra_sqlite::rusqlite::Connection;

/// Máximo de páginas no grafo (as editadas por último, se houver mais).
pub const MAX_GRAPH_NODES: usize = 400;

/// Uma página, para listas de ligações.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageRef {
    pub id: String,
    pub title: String,
    pub icon: Option<String>,
    pub is_database: bool,
}

/// Uma ligação do grafo: `kind` é `"link"` (menção ou subpágina escrita no texto) ou `"child"` (hierarquia).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GraphEdge {
    pub from: String,
    pub to: String,
    pub kind: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Graph {
    pub nodes: Vec<PageRef>,
    pub edges: Vec<GraphEdge>,
}

/// Ids de páginas referenciados no conteúdo: blocos `childPage` e menções em linha, na ordem em que aparecem, sem
/// repetir. Conteúdo que não é JSON válido não referencia nada.
pub fn extract_references(content: &str) -> Vec<String> {
    fn walk(value: &Value, out: &mut Vec<String>) {
        match value {
            Value::Array(items) => items.iter().for_each(|item| walk(item, out)),
            Value::Object(object) => {
                let kind = object.get("type").and_then(Value::as_str);
                if matches!(kind, Some("childPage") | Some("mention"))
                    && let Some(id) = object
                        .get("props")
                        .and_then(|props| props.get("pageId"))
                        .and_then(Value::as_str)
                    && !out.iter().any(|seen| seen == id)
                {
                    out.push(id.to_string());
                }
                object.values().for_each(|child| walk(child, out));
            }
            _ => {}
        }
    }
    let mut out = Vec::new();
    if let Ok(value) = serde_json::from_str::<Value>(content) {
        walk(&value, &mut out);
    }
    out
}

/// As páginas ATIVAS que mencionam `id` (ou o têm como subpágina no texto), em ordem alfabética. Não inclui a própria.
pub fn backlinks(conn: &Connection, id: &str) -> Result<Vec<PageRef>, NotesError> {
    // O filtro LIKE descarta quase tudo de graça; a confirmação lê o JSON só das candidatas.
    let mut stmt = conn.prepare(
        "SELECT id, title, icon, content,
                EXISTS (SELECT 1 FROM notes_database d WHERE d.note_id = notes_note.id)
           FROM notes_note
          WHERE deleted_at IS NULL AND id <> ?1 AND instr(content, ?1) > 0
          ORDER BY title COLLATE NOCASE, id",
    )?;
    let rows = stmt.query_map([id], |row| {
        Ok((
            PageRef {
                id: row.get(0)?,
                title: row.get(1)?,
                icon: row.get(2)?,
                is_database: row.get(4)?,
            },
            row.get::<_, String>(3)?,
        ))
    })?;
    let mut found = Vec::new();
    for row in rows {
        let (page, content) = row?;
        if extract_references(&content)
            .iter()
            .any(|target| target == id)
        {
            found.push(page);
        }
    }
    Ok(found)
}

/// O grafo de conexões das páginas ativas. As linhas de bases de dados ficam de fora (fariam só barulho). Havendo mais de
/// [`MAX_GRAPH_NODES`] páginas, entram as editadas por último.
pub fn graph(conn: &Connection) -> Result<Graph, NotesError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, icon, content, parent_id,
                EXISTS (SELECT 1 FROM notes_database d WHERE d.note_id = notes_note.id)
           FROM notes_note
          WHERE deleted_at IS NULL
          ORDER BY updated_at DESC, id",
    )?;
    struct Row {
        page: PageRef,
        content: String,
        parent: Option<String>,
    }
    let all: Vec<Row> = stmt
        .query_map([], |row| {
            Ok(Row {
                page: PageRef {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    icon: row.get(2)?,
                    is_database: row.get(5)?,
                },
                content: row.get(3)?,
                parent: row.get(4)?,
            })
        })?
        .collect::<Result<_, _>>()?;

    let databases: HashSet<&str> = all
        .iter()
        .filter(|r| r.page.is_database)
        .map(|r| r.page.id.as_str())
        .collect();
    let kept: Vec<&Row> = all
        .iter()
        .filter(|r| !r.parent.as_deref().is_some_and(|p| databases.contains(p)))
        .take(MAX_GRAPH_NODES)
        .collect();
    let ids: HashSet<&str> = kept.iter().map(|r| r.page.id.as_str()).collect();

    let mut seen: HashSet<(String, String, &'static str)> = HashSet::new();
    let mut edges: Vec<GraphEdge> = Vec::new();
    let mut add = |from: &str, to: &str, kind: &'static str| {
        if seen.insert((from.to_string(), to.to_string(), kind)) {
            edges.push(GraphEdge {
                from: from.to_string(),
                to: to.to_string(),
                kind,
            });
        }
    };
    // Hierarquia primeiro: uma subpágina escrita no texto do pai não vira uma segunda ligação.
    for row in &kept {
        if let Some(parent) = row.parent.as_deref().filter(|p| ids.contains(p)) {
            add(parent, &row.page.id, "child");
        }
    }
    let parents: HashMap<&str, Option<&str>> = kept
        .iter()
        .map(|r| (r.page.id.as_str(), r.parent.as_deref()))
        .collect();
    for row in &kept {
        for target in extract_references(&row.content) {
            if target == row.page.id || !ids.contains(target.as_str()) {
                continue;
            }
            if parents.get(target.as_str()) == Some(&Some(row.page.id.as_str())) {
                continue; // já é a ligação "child"
            }
            add(&row.page.id, &target, "link");
        }
    }
    Ok(Graph {
        nodes: kept.into_iter().map(|r| r.page.clone()).collect(),
        edges,
    })
}
