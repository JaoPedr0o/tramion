//! Modelos de página (embutidos no aplicativo): pontos de partida para uma nova página, criados na raiz ou dentro de
//! outra página. Os textos são só um esqueleto para a pessoa preencher.

use crate::database;
use crate::error::NotesError;
use crate::model::Note;
use crate::samples::{Block, bullet, heading, page_in, paragraph, todo};
use serde::Serialize;
use serde_json::json;
use tramion_infra_sqlite::rusqlite::Connection;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub icon: &'static str,
    pub description: &'static str,
}

pub const TEMPLATES: [TemplateInfo; 5] = [
    TemplateInfo {
        id: "meeting",
        name: "Notas de reunião",
        icon: "🗒️",
        description: "Pauta, decisões e próximos passos",
    },
    TemplateInfo {
        id: "weekly",
        name: "Planejamento da semana",
        icon: "🗓️",
        description: "Prioridades e um espaço para cada dia",
    },
    TemplateInfo {
        id: "project",
        name: "Plano de projeto",
        icon: "🎯",
        description: "Objetivo, escopo, marcos e riscos",
    },
    TemplateInfo {
        id: "journal",
        name: "Entrada de diário",
        icon: "📓",
        description: "Um espaço livre para o dia",
    },
    TemplateInfo {
        id: "tasks",
        name: "Lista de tarefas",
        icon: "✅",
        description: "Base de dados com status, prioridade e prazo",
    },
];

/// Os modelos disponíveis, na ordem em que aparecem.
pub fn list_templates() -> Vec<TemplateInfo> {
    TEMPLATES.to_vec()
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
    let info = TEMPLATES
        .iter()
        .find(|t| t.id == template_id)
        .ok_or(NotesError::NotFound)?;

    if template_id == "tasks" {
        let note = database::create_database(conn, info.name, parent_id)?;
        crate::service::set_appearance(conn, &note.id, Some(info.icon), None)?;
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
    page_in(conn, parent_id, info.name, info.icon, None, &blocks)
}
