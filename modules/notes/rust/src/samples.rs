//! Páginas de exemplo da primeira abertura (como o Notion): um guia, uma lista de tarefas, uma lista de leituras e
//! um diário. Só são criadas quando o banco está completamente vazio, e UMA única vez: um marcador impede que
//! voltem depois que a pessoa apagar tudo.

use crate::database;
use crate::error::NotesError;
use crate::model::{NewNote, Note, UpdateNote};
use crate::service;
use serde_json::{Value, json};
use tramion_infra_sqlite::rusqlite::{Connection, OptionalExtension};

const MARKER_KEY: &str = "samples_seeded";

/// Um bloco do editor e o texto simples dele (para a busca, que lê o espelho `body`).
struct Block {
    json: Value,
    text: String,
}

fn rich(text: &str) -> Value {
    json!([{ "type": "text", "text": text, "styles": {} }])
}

fn block(kind: &str, props: Value, text: &str) -> Block {
    Block {
        json: json!({ "type": kind, "props": props, "content": rich(text), "children": [] }),
        text: text.to_string(),
    }
}

fn paragraph(text: &str) -> Block {
    block("paragraph", json!({}), text)
}
fn heading(level: u8, text: &str) -> Block {
    block("heading", json!({ "level": level }), text)
}
fn bullet(text: &str) -> Block {
    block("bulletListItem", json!({}), text)
}
fn todo(text: &str, checked: bool) -> Block {
    block("checkListItem", json!({ "checked": checked }), text)
}
fn quote(text: &str) -> Block {
    block("quote", json!({}), text)
}

/// Cria a página com o conteúdo, o símbolo e (opcional) a capa.
fn page(
    conn: &Connection,
    title: &str,
    icon: &str,
    cover: Option<&str>,
    blocks: &[Block],
) -> Result<Note, NotesError> {
    let note = service::create(
        conn,
        NewNote {
            title: title.to_string(),
            body: String::new(),
            parent_id: None,
        },
    )?;
    let body = blocks
        .iter()
        .map(|b| b.text.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let content = Value::Array(blocks.iter().map(|b| b.json.clone()).collect()).to_string();
    service::update(
        conn,
        UpdateNote {
            id: note.id.clone(),
            title: title.to_string(),
            body,
            content,
            expected_updated_at: note.updated_at,
        },
    )?;
    service::set_appearance(conn, &note.id, Some(icon), cover)
}

/// A data de daqui a `days` dias (`AAAA-MM-DD`), calculada pelo SQLite.
fn in_days(conn: &Connection, days: i64) -> Result<String, NotesError> {
    Ok(conn.query_row(
        "SELECT date('now', ?1)",
        [format!("{days:+} days")],
        |row| row.get(0),
    )?)
}

fn option(id: &str, name: &str, color: &str) -> Value {
    json!({ "id": id, "name": name, "color": color })
}

/// Cria a base, as colunas (com as opções das colunas de seleção) e devolve os ids das colunas, na ordem dada.
fn base(
    conn: &Connection,
    title: &str,
    icon: &str,
    columns: &[(&str, &str, Option<Value>)],
) -> Result<(Note, Vec<String>), NotesError> {
    let note = database::create_database(conn, title, None)?;
    service::set_appearance(conn, &note.id, Some(icon), None)?;
    let mut ids = Vec::new();
    for (name, kind, options) in columns {
        let property = database::add_property(conn, &note.id, name, kind)?;
        if let Some(options) = options {
            database::update_property(conn, &property.id, None, Some(options))?;
        }
        ids.push(property.id);
    }
    Ok((note, ids))
}

fn tasks(conn: &Connection) -> Result<(), NotesError> {
    let (base_note, c) = base(
        conn,
        "Lista de tarefas",
        "✅",
        &[
            (
                "Status",
                "select",
                Some(json!([
                    option("a-fazer", "A fazer", "gray"),
                    option("em-andamento", "Em andamento", "blue"),
                    option("feito", "Feito", "green"),
                ])),
            ),
            (
                "Prioridade",
                "select",
                Some(json!([
                    option("alta", "Alta", "red"),
                    option("media", "Média", "orange"),
                    option("baixa", "Baixa", "gray"),
                ])),
            ),
            ("Prazo", "date", None),
        ],
    )?;
    // Outras formas de ver as mesmas tarefas: um quadro por status e um calendário pelo prazo.
    database::add_view(
        conn,
        &base_note.id,
        "Por status",
        &json!({ "mode": "board", "groupBy": c[0] }),
    )?;
    database::add_view(
        conn,
        &base_note.id,
        "Calendário",
        &json!({ "mode": "calendar", "dateProperty": c[2], "scale": "month" }),
    )?;
    let rows = [
        ("Explorar as páginas de exemplo", "feito", "baixa", 0),
        ("Criar a minha primeira página", "em-andamento", "alta", 1),
        ("Montar o planejamento da semana", "a-fazer", "media", 3),
        (
            "Experimentar o quadro e o calendário",
            "a-fazer",
            "baixa",
            5,
        ),
        (
            "Apagar estas páginas de exemplo quando quiser",
            "a-fazer",
            "baixa",
            14,
        ),
    ];
    for (title, status, priority, days) in rows {
        let row = database::create_row(conn, &base_note.id, title)?;
        database::set_cell(conn, &row.id, &c[0], &json!(status))?;
        database::set_cell(conn, &row.id, &c[1], &json!(priority))?;
        database::set_cell(conn, &row.id, &c[2], &json!(in_days(conn, days)?))?;
    }
    Ok(())
}

fn readings(conn: &Connection) -> Result<(), NotesError> {
    let (base_note, c) = base(
        conn,
        "Leituras",
        "📚",
        &[
            ("Autor", "text", None),
            (
                "Status",
                "select",
                Some(json!([
                    option("quero-ler", "Quero ler", "gray"),
                    option("lendo", "Lendo", "blue"),
                    option("lido", "Lido", "green"),
                ])),
            ),
            ("Nota", "number", None),
        ],
    )?;
    let rows = [
        ("Dom Casmurro", "Machado de Assis", "lido", Some(5)),
        ("A Hora da Estrela", "Clarice Lispector", "lendo", None),
        (
            "Grande Sertão: Veredas",
            "Guimarães Rosa",
            "quero-ler",
            None,
        ),
    ];
    for (title, author, status, grade) in rows {
        let row = database::create_row(conn, &base_note.id, title)?;
        database::set_cell(conn, &row.id, &c[0], &json!(author))?;
        database::set_cell(conn, &row.id, &c[1], &json!(status))?;
        if let Some(grade) = grade {
            database::set_cell(conn, &row.id, &c[2], &json!(grade))?;
        }
    }
    Ok(())
}

/// Cria as páginas de exemplo, sem conferir nada antes. Use [`seed_if_first_run`] na abertura do app.
pub fn create_samples(conn: &Connection) -> Result<(), NotesError> {
    page(
        conn,
        "Comece por aqui",
        "👋",
        Some("color:#d8cbb6"),
        &[
            heading(1, "Guia rápido"),
            paragraph(
                "Este é um espaço só seu: tudo fica guardado no seu computador. Estas páginas de exemplo mostram o que dá para fazer. Edite, apague ou crie as suas.",
            ),
            heading(2, "Primeiros passos"),
            todo(
                "Digite / em qualquer linha para inserir títulos, listas, código, imagens e mais",
                false,
            ),
            todo("Escreva @ e o nome de uma página para mencioná-la", false),
            todo(
                "Arraste os blocos pela alça ao lado deles para reordenar",
                false,
            ),
            todo(
                "Passe o mouse acima do título para adicionar um ícone e uma capa",
                false,
            ),
            todo("Crie uma subpágina com / e Página", false),
            todo(
                "Mude entre o tema claro e o escuro pelo botão de tema",
                false,
            ),
            heading(2, "Bases de dados"),
            paragraph(
                "Uma base de dados é uma coleção de páginas com colunas. Abra a Lista de tarefas e as Leituras na barra lateral e troque a forma de exibição: Tabela, Quadro, Lista, Galeria e Calendário.",
            ),
            heading(2, "Atalhos"),
            bullet("Ctrl + \\ recolhe e abre a barra lateral"),
            bullet("Ctrl + B e Ctrl + I deixam o texto em negrito e em itálico"),
            bullet("Tab recua um item de lista e Shift + Tab desfaz o recuo"),
            quote("Um lugar bonito para pensar."),
        ],
    )?;
    tasks(conn)?;
    readings(conn)?;
    page(
        conn,
        "Diário",
        "📓",
        Some("color:#cdd5c4"),
        &[
            heading(1, "Diário"),
            paragraph("Um espaço para escrever sobre o dia, sem pressa e sem formato."),
            heading(2, "Hoje"),
            todo("Uma coisa boa que aconteceu", false),
            todo("Uma coisa que aprendi", false),
            todo("Algo que quero fazer amanhã", false),
            paragraph(""),
        ],
    )?;
    Ok(())
}

/// Na primeira abertura com o banco vazio, cria as páginas de exemplo. Devolve `true` se criou.
///
/// - Se o marcador existe, nunca recria (nem depois que a pessoa apagar tudo).
/// - Se já existe qualquer página (ativa ou na lixeira), não cria nada, mas grava o marcador: quem já usava o app não
///   ganha páginas que não pediu.
pub fn seed_if_first_run(conn: &Connection) -> Result<bool, NotesError> {
    let seeded: Option<String> = conn
        .query_row(
            "SELECT value FROM notes_meta WHERE key = ?1",
            [MARKER_KEY],
            |r| r.get(0),
        )
        .optional()?;
    if seeded.is_some() {
        return Ok(false);
    }

    let existing: i64 = conn.query_row("SELECT COUNT(*) FROM notes_note", [], |r| r.get(0))?;
    let created = if existing == 0 {
        create_samples(conn)?;
        true
    } else {
        false
    };
    conn.execute(
        "INSERT OR REPLACE INTO notes_meta (key, value) VALUES (?1, '1')",
        [MARKER_KEY],
    )?;
    Ok(created)
}
