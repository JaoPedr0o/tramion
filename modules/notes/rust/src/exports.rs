//! Exportar uma página como arquivo Markdown na pasta Downloads: nome seguro derivado do título, sem sobrescrever
//! arquivos que já existem.

use crate::error::NotesError;
use std::fs;
use std::path::{Path, PathBuf};

/// Máximo de bytes de um arquivo exportado (o mesmo limite do conteúdo de uma página).
pub const MAX_EXPORT_BYTES: usize = 5_000_000;
/// Máximo de caracteres do nome do arquivo, sem a extensão.
const MAX_NAME_CHARS: usize = 100;

/// Nome de arquivo seguro a partir do título: sem separadores de pasta, caracteres de controle nem os proibidos no
/// Windows; sem pontos nem espaços nas pontas; nunca vazio. Sempre termina em `.md`.
pub fn safe_file_name(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| {
            if c.is_control() || "/\\:*?\"<>|".contains(c) {
                ' '
            } else {
                c
            }
        })
        .collect();
    let squeezed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed: String = squeezed
        .trim_matches(|c: char| c == '.' || c.is_whitespace())
        .chars()
        .take(MAX_NAME_CHARS)
        .collect();
    let stem = if trimmed.is_empty() {
        "Sem título"
    } else {
        trimmed.trim_end()
    };
    format!("{stem}.md")
}

/// Caminho livre dentro de `dir`: `Nome.md`, ou `Nome (2).md`, `Nome (3).md`... se já existir.
pub fn unique_path(dir: &Path, file_name: &str) -> PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let stem = file_name.strip_suffix(".md").unwrap_or(file_name);
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}).md")))
        .find(|path| !path.exists())
        .expect("sempre existe um número livre")
}

/// Grava o Markdown em `dir` com um nome seguro derivado de `title` e devolve o caminho criado.
pub fn save_markdown(dir: &Path, title: &str, content: &str) -> Result<PathBuf, NotesError> {
    if content.len() > MAX_EXPORT_BYTES {
        return Err(NotesError::ContentTooLarge {
            max: MAX_EXPORT_BYTES,
        });
    }
    fs::create_dir_all(dir).map_err(|e| NotesError::Internal(e.to_string()))?;
    let path = unique_path(dir, &safe_file_name(title));
    fs::write(&path, content).map_err(|e| NotesError::Internal(e.to_string()))?;
    Ok(path)
}
