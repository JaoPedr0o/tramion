//! Busca global (Ctrl + K): procura nas páginas ativas pelo título e pelo texto, sem diferenciar maiúsculas nem acentos
//! ("acao" encontra "Ação"). Todas as palavras digitadas precisam aparecer (no título ou no texto). O título vale mais
//! que o texto na ordenação, e cada resultado traz um trecho do texto em volta do que foi encontrado.

use crate::error::NotesError;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use tramion_infra_sqlite::rusqlite::Connection;

/// Máximo de caracteres da busca (o resto é ignorado).
pub const MAX_QUERY_CHARS: usize = 100;
/// Máximo de resultados que se pode pedir.
pub const MAX_LIMIT: usize = 50;

const SNIPPET_BEFORE: usize = 30;
const SNIPPET_AFTER: usize = 70;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: String,
    pub title: String,
    pub icon: Option<String>,
    pub is_database: bool,
    /// Trecho do texto da página (vazio se a página não tem texto).
    pub snippet: String,
    /// `true` se o título bate com a busca (senão, só o texto bateu).
    pub in_title: bool,
}

/// Minúscula e sem acento, um caractere por caractere (o tamanho se mantém, para os índices baterem com o original).
pub fn fold(text: &str) -> String {
    text.chars().map(fold_char).collect()
}

fn fold_char(c: char) -> char {
    let lower = c.to_lowercase().next().unwrap_or(c);
    match lower {
        'á' | 'à' | 'â' | 'ã' | 'ä' | 'å' => 'a',
        'é' | 'è' | 'ê' | 'ë' => 'e',
        'í' | 'ì' | 'î' | 'ï' => 'i',
        'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
        'ú' | 'ù' | 'û' | 'ü' => 'u',
        'ç' => 'c',
        'ñ' => 'n',
        other => other,
    }
}

/// Posição (em caracteres) da primeira ocorrência de `needle` em `haystack`, ambos já "dobrados".
fn find(haystack: &[char], needle: &[char]) -> Option<usize> {
    if needle.is_empty() || needle.len() > haystack.len() {
        return None;
    }
    (0..=haystack.len() - needle.len()).find(|&i| haystack[i..i + needle.len()] == *needle)
}

/// Um trecho do texto original em volta da posição `at`, em uma linha, com reticências quando corta.
fn snippet_around(original: &[char], at: usize) -> String {
    let start = at.saturating_sub(SNIPPET_BEFORE);
    let end = (at + SNIPPET_AFTER).min(original.len());
    let body: String = original[start..end]
        .iter()
        .map(|&c| if c.is_whitespace() { ' ' } else { c })
        .collect();
    let body = body.split_whitespace().collect::<Vec<_>>().join(" ");
    format!(
        "{}{}{}",
        if start > 0 { "…" } else { "" },
        body,
        if end < original.len() { "…" } else { "" }
    )
}

/// O texto das células de cada linha de base de dados ("Coluna: valor · Coluna: valor"), para a busca achar linhas pelo
/// que está nas colunas. Seleções entram pelo NOME da opção; caixas de seleção não entram.
fn cell_texts(conn: &Connection) -> Result<HashMap<String, String>, NotesError> {
    let mut stmt = conn.prepare(
        "SELECT c.note_id, c.value, p.kind, p.name, p.options
           FROM notes_cell c JOIN notes_property p ON p.id = c.property_id
          ORDER BY c.note_id, p.position, p.id",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
        ))
    })?;
    let mut texts: HashMap<String, Vec<String>> = HashMap::new();
    for row in rows {
        let (note_id, raw, kind, name, options) = row?;
        let Ok(value) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        let option_name = |id: &str| -> String {
            serde_json::from_str::<Value>(&options)
                .ok()
                .and_then(|list| {
                    list.as_array()?
                        .iter()
                        .find(|o| o.get("id").and_then(Value::as_str) == Some(id))
                        .and_then(|o| o.get("name")?.as_str().map(str::to_string))
                })
                .unwrap_or_else(|| id.to_string())
        };
        let text = match (kind.as_str(), &value) {
            ("select", Value::String(id)) => option_name(id),
            ("multi_select", Value::Array(ids)) => ids
                .iter()
                .filter_map(Value::as_str)
                .map(option_name)
                .collect::<Vec<_>>()
                .join(", "),
            (_, Value::String(text)) => text.clone(),
            (_, Value::Number(number)) => number.to_string(),
            _ => continue,
        };
        if !text.is_empty() {
            texts
                .entry(note_id)
                .or_default()
                .push(format!("{name}: {text}"));
        }
    }
    Ok(texts
        .into_iter()
        .map(|(id, parts)| (id, parts.join(" · ")))
        .collect())
}

struct Candidate {
    hit: SearchHit,
    score: i64,
    updated_at: i64,
}

/// Procura nas páginas ativas. Busca vazia devolve lista vazia. `limit` é limitado a [`MAX_LIMIT`].
pub fn search(conn: &Connection, query: &str, limit: usize) -> Result<Vec<SearchHit>, NotesError> {
    let query: String = query.chars().take(MAX_QUERY_CHARS).collect();
    let words: Vec<Vec<char>> = fold(&query)
        .split_whitespace()
        .map(|w| w.chars().collect())
        .collect();
    if words.is_empty() {
        return Ok(Vec::new());
    }
    let first = &words[0];

    let mut stmt = conn.prepare(
        "SELECT id, title, body, icon, updated_at,
                EXISTS (SELECT 1 FROM notes_database d WHERE d.note_id = notes_note.id)
           FROM notes_note
          WHERE deleted_at IS NULL",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, i64>(4)?,
            row.get::<_, bool>(5)?,
        ))
    })?;

    let cells = cell_texts(conn)?;
    let mut found: Vec<Candidate> = Vec::new();
    for row in rows {
        let (id, title, body, icon, updated_at, is_database) = row?;
        // Linhas de bases também são achadas pelo que está nas colunas.
        let body = match cells.get(&id) {
            None => body,
            Some(cell) if body.is_empty() => cell.clone(),
            Some(cell) => format!("{body} · {cell}"),
        };
        let title_folded: Vec<char> = fold(&title).chars().collect();
        let body_folded: Vec<char> = fold(&body).chars().collect();

        // Cada palavra precisa estar no título ou no texto.
        let all_found = words
            .iter()
            .all(|w| find(&title_folded, w).is_some() || find(&body_folded, w).is_some());
        if !all_found {
            continue;
        }
        let in_title = words.iter().all(|w| find(&title_folded, w).is_some());

        let mut score = 0;
        if in_title {
            score += 100;
            if title_folded == *first && words.len() == 1 {
                score += 100; // título exatamente igual
            } else if title_folded.starts_with(first) {
                score += 50;
            }
        }
        if words.iter().any(|w| find(&body_folded, w).is_some()) {
            score += 10;
        }

        let body_chars: Vec<char> = body.chars().collect();
        let snippet = words
            .iter()
            .find_map(|w| find(&body_folded, w))
            .map(|at| snippet_around(&body_chars, at))
            .unwrap_or_else(|| snippet_around(&body_chars, 0));

        found.push(Candidate {
            hit: SearchHit {
                id,
                title,
                icon,
                is_database,
                snippet,
                in_title,
            },
            score,
            updated_at,
        });
    }

    found.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then(b.updated_at.cmp(&a.updated_at))
            .then(a.hit.id.cmp(&b.hit.id))
    });
    found.truncate(limit.clamp(1, MAX_LIMIT));
    Ok(found.into_iter().map(|c| c.hit).collect())
}
