//! Modelos de página (embutidos no aplicativo): pontos de partida para uma nova página, criados na raiz ou dentro de
//! outra página. Os textos são só um esqueleto para a pessoa preencher.

use crate::database;
use crate::error::NotesError;
use crate::model::Note;
use crate::samples::{Block, bullet, heading, page_in, paragraph, todo};
use serde::Serialize;
use serde_json::json;
use tramion_infra_sqlite::rusqlite::{Connection, OptionalExtension};

/// Um modelo de página (embutido ou criado pela pessoa).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateInfo {
    /// Os embutidos têm ids fixos ("meeting"...); os da pessoa começam com `user:`.
    pub id: String,
    pub name: String,
    pub icon: String,
    pub description: String,
    /// `true` para os modelos criados pela pessoa (que podem ser apagados).
    pub custom: bool,
}

/// Um modelo embutido: `(id, nome, símbolo, descrição)`.
pub type BuiltIn = (&'static str, &'static str, &'static str, &'static str);

pub const TEMPLATES: [BuiltIn; 5] = [
    (
        "meeting",
        "Notas de reunião",
        "🗒️",
        "Pauta, decisões e próximos passos",
    ),
    (
        "weekly",
        "Planejamento da semana",
        "🗓️",
        "Prioridades e um espaço para cada dia",
    ),
    (
        "project",
        "Plano de projeto",
        "🎯",
        "Objetivo, escopo, marcos e riscos",
    ),
    (
        "journal",
        "Entrada de diário",
        "📓",
        "Um espaço livre para o dia",
    ),
    (
        "tasks",
        "Lista de tarefas",
        "✅",
        "Base de dados com status, prioridade e prazo",
    ),
];

/// Máximo de modelos criados pela pessoa.
pub const MAX_USER_TEMPLATES: i64 = 30;
const USER_PREFIX: &str = "user:";

fn built_in_info((id, name, icon, description): &BuiltIn) -> TemplateInfo {
    TemplateInfo {
        id: (*id).to_string(),
        name: (*name).to_string(),
        icon: (*icon).to_string(),
        description: (*description).to_string(),
        custom: false,
    }
}

/// Os modelos disponíveis: os embutidos e, depois, os da pessoa (do mais antigo ao mais novo).
pub fn list_templates(conn: &Connection) -> Result<Vec<TemplateInfo>, NotesError> {
    let mut all: Vec<TemplateInfo> = TEMPLATES.iter().map(built_in_info).collect();
    let mut stmt =
        conn.prepare("SELECT id, name, icon FROM notes_user_template ORDER BY created_at, rowid")?;
    let rows = stmt.query_map([], |row| {
        Ok(TemplateInfo {
            id: format!("{USER_PREFIX}{}", row.get::<_, String>(0)?),
            name: row.get(1)?,
            icon: row.get(2)?,
            description: "Criado por você".to_string(),
            custom: true,
        })
    })?;
    for row in rows {
        all.push(row?);
    }
    Ok(all)
}

/// Remove os blocos de subpágina (`childPage`) do conteúdo: o modelo não deve apontar para páginas que já existem.
fn without_child_pages(content: &str) -> String {
    fn clean(blocks: &mut Vec<serde_json::Value>) {
        blocks.retain(|b| b.get("type").and_then(serde_json::Value::as_str) != Some("childPage"));
        for block in blocks.iter_mut() {
            if let Some(children) = block
                .get_mut("children")
                .and_then(serde_json::Value::as_array_mut)
            {
                clean(children);
            }
        }
    }
    match serde_json::from_str::<serde_json::Value>(content) {
        Ok(serde_json::Value::Array(mut blocks)) => {
            clean(&mut blocks);
            serde_json::Value::Array(blocks).to_string()
        }
        _ => "[]".to_string(),
    }
}

/// Cria um modelo a partir de uma página comum ativa: copia nome (o título), símbolo, texto e conteúdo (sem subpáginas).
/// Bases de dados não viram modelo. Limite de [`MAX_USER_TEMPLATES`].
pub fn save_as_template(conn: &Connection, note_id: &str) -> Result<TemplateInfo, NotesError> {
    let note = crate::service::get(conn, note_id)?;
    if note.deleted_at.is_some() {
        return Err(NotesError::InTrash);
    }
    if crate::database_repository::is_database(conn, note_id)? {
        return Err(NotesError::TemplateInvalid);
    }
    let count: i64 =
        conn.query_row("SELECT COUNT(*) FROM notes_user_template", [], |r| r.get(0))?;
    if count >= MAX_USER_TEMPLATES {
        return Err(NotesError::TemplateInvalid);
    }
    let icon = note.icon.clone().unwrap_or_else(|| "📄".to_string());
    let id: String = conn.query_row(
        "INSERT INTO notes_user_template (name, icon, body, content) VALUES (?1, ?2, ?3, ?4) RETURNING id",
        tramion_infra_sqlite::rusqlite::params![note.title, icon, note.body, without_child_pages(&note.content)],
        |r| r.get(0),
    )?;
    Ok(TemplateInfo {
        id: format!("{USER_PREFIX}{id}"),
        name: note.title,
        icon,
        description: "Criado por você".to_string(),
        custom: true,
    })
}

/// Apaga um modelo criado pela pessoa (os embutidos não podem ser apagados).
pub fn delete_user_template(conn: &Connection, template_id: &str) -> Result<(), NotesError> {
    let id = template_id
        .strip_prefix(USER_PREFIX)
        .ok_or(NotesError::NotFound)?;
    let removed = conn.execute("DELETE FROM notes_user_template WHERE id = ?1", [id])?;
    if removed == 0 {
        return Err(NotesError::NotFound);
    }
    Ok(())
}

fn blocks_for(id: &str) -> Option<Vec<Block>> {
    Some(match id {
        "meeting" => vec![
            heading(2, "Participantes"),
            bullet(""),
            heading(2, "Pauta"),
            bullet(""),
            heading(2, "Decisões"),
            bullet(""),
            heading(2, "Próximos passos"),
            todo("", false),
        ],
        "weekly" => vec![
            heading(2, "Prioridades da semana"),
            todo("", false),
            todo("", false),
            todo("", false),
            heading(3, "Segunda-feira"),
            paragraph(""),
            heading(3, "Terça-feira"),
            paragraph(""),
            heading(3, "Quarta-feira"),
            paragraph(""),
            heading(3, "Quinta-feira"),
            paragraph(""),
            heading(3, "Sexta-feira"),
            paragraph(""),
            heading(2, "Para levar para a próxima semana"),
            bullet(""),
        ],
        "project" => vec![
            heading(2, "Objetivo"),
            paragraph(""),
            heading(2, "Escopo"),
            bullet(""),
            heading(2, "Marcos"),
            todo("", false),
            heading(2, "Riscos"),
            bullet(""),
        ],
        "journal" => vec![
            heading(2, "Hoje"),
            paragraph(""),
            heading(3, "Uma coisa boa"),
            paragraph(""),
            heading(3, "Uma coisa que aprendi"),
            paragraph(""),
        ],
        _ => return None,
    })
}

/// Cria uma página (ou base, no modelo de tarefas) a partir de um modelo, na raiz ou dentro de `parent_id`.
pub fn create_from_template(
    conn: &Connection,
    template_id: &str,
    parent_id: Option<&str>,
) -> Result<Note, NotesError> {
    if let Some(id) = template_id.strip_prefix(USER_PREFIX) {
        return create_from_user_template(conn, id, parent_id);
    }
    let (_, name, icon, _) = TEMPLATES
        .iter()
        .find(|t| t.0 == template_id)
        .ok_or(NotesError::NotFound)?;

    if template_id == "tasks" {
        let note = database::create_database(conn, name, parent_id)?;
        crate::service::set_appearance(conn, &note.id, Some(icon), None)?;
        let status = database::add_property(conn, &note.id, "Status", "select")?;
        database::update_property(
            conn,
            &status.id,
            None,
            Some(&json!([
                { "id": "a-fazer", "name": "A fazer", "color": "gray" },
                { "id": "em-andamento", "name": "Em andamento", "color": "blue" },
                { "id": "feito", "name": "Feito", "color": "green" },
            ])),
        )?;
        database::add_property(conn, &note.id, "Prioridade", "select")?;
        database::add_property(conn, &note.id, "Prazo", "date")?;
        return crate::service::get(conn, &note.id);
    }

    let blocks = blocks_for(template_id).ok_or(NotesError::NotFound)?;
    page_in(conn, parent_id, name, icon, None, &blocks)
}

/// Cria uma página a partir de um modelo da pessoa: título, símbolo, texto e conteúdo copiados do modelo.
fn create_from_user_template(
    conn: &Connection,
    id: &str,
    parent_id: Option<&str>,
) -> Result<Note, NotesError> {
    let (name, icon, body, content): (String, String, String, String) = conn
        .query_row(
            "SELECT name, icon, body, content FROM notes_user_template WHERE id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()?
        .ok_or(NotesError::NotFound)?;
    let note = crate::service::create(
        conn,
        crate::model::NewNote {
            title: name.clone(),
            body: String::new(),
            parent_id: parent_id.map(str::to_string),
        },
    )?;
    crate::service::update(
        conn,
        crate::model::UpdateNote {
            id: note.id.clone(),
            title: name,
            body,
            content,
            expected_updated_at: note.updated_at,
        },
    )?;
    crate::service::set_appearance(conn, &note.id, Some(&icon), None)
}
