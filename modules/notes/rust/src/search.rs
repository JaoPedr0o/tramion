//! Busca global (Ctrl + K): procura nas páginas ativas pelo título e pelo texto, sem diferenciar maiúsculas nem acentos
//! ("acao" encontra "Ação"). Todas as palavras digitadas precisam aparecer (no título ou no texto). O título vale mais
//! que o texto na ordenação, e cada resultado traz um trecho do texto em volta do que foi encontrado.

use crate::error::NotesError;
use serde::Serialize;
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

    let mut found: Vec<Candidate> = Vec::new();
    for row in rows {
        let (id, title, body, icon, updated_at, is_database) = row?;
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
