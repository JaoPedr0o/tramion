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

// ───────── Exportar tudo para uma pasta ─────────

/// Máximo de arquivos de uma exportação completa.
pub const MAX_EXPORT_FILES: usize = 5_000;
/// Máximo de bytes somados de uma exportação completa (200 MB).
pub const MAX_EXPORT_TOTAL_BYTES: usize = 200_000_000;

/// Um arquivo da exportação: o caminho em partes (pastas e, por último, o nome sem `.md`) e o conteúdo.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ExportFile {
    pub path: Vec<String>,
    pub content: String,
}

/// O que a exportação fez.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
    pub folder: String,
    pub written: usize,
}

/// Nome seguro de uma PASTA (as mesmas regras do nome de arquivo, sem a extensão).
fn safe_dir_name(part: &str) -> String {
    let file = safe_file_name(part);
    file.strip_suffix(".md").unwrap_or(&file).to_string()
}

/// Grava a árvore de arquivos Markdown dentro de `root`, sem nunca sair dela. Cada parte do caminho passa por nome
/// seguro; nomes que ficam iguais na mesma pasta (sem diferenciar maiúsculas) ganham " (2)", " (3)"... Arquivos que já
/// existem de uma exportação anterior são SUBSTITUÍDOS (é assim que o espelho se atualiza); nada é apagado.
pub fn export_tree(root: &Path, files: &[ExportFile]) -> Result<ExportReport, NotesError> {
    if files.len() > MAX_EXPORT_FILES
        || files.iter().map(|f| f.content.len()).sum::<usize>() > MAX_EXPORT_TOTAL_BYTES
        || files.iter().any(|f| f.content.len() > MAX_EXPORT_BYTES)
    {
        return Err(NotesError::ContentTooLarge {
            max: MAX_EXPORT_TOTAL_BYTES,
        });
    }
    fs::create_dir_all(root).map_err(|e| NotesError::Internal(e.to_string()))?;

    // Nomes já usados nesta exportação, por pasta (em minúsculas), para não sobrescrever um arquivo com outro.
    let mut used: std::collections::HashMap<PathBuf, std::collections::HashSet<String>> =
        std::collections::HashMap::new();
    let mut claim = |dir: &Path, name: String, is_file: bool| -> String {
        let taken = used.entry(dir.to_path_buf()).or_default();
        let suffix = if is_file { ".md" } else { "" };
        let mut candidate = name.clone();
        let mut n = 1;
        while !taken.insert(format!("{}{suffix}", candidate.to_lowercase())) {
            n += 1;
            candidate = format!("{name} ({n})");
        }
        candidate
    };

    let mut folders: std::collections::HashMap<(PathBuf, String), String> =
        std::collections::HashMap::new();
    let mut written = 0;
    for file in files {
        let Some((last, dirs)) = file.path.split_last() else {
            continue;
        };
        let mut dir = root.to_path_buf();
        for part in dirs {
            // A mesma pasta (mesmo pai e mesmo nome de origem) tem sempre o mesmo nome final.
            let key = (dir.clone(), part.clone());
            let name = match folders.get(&key) {
                Some(name) => name.clone(),
                None => {
                    let name = claim(&dir, safe_dir_name(part), false);
                    folders.insert(key, name.clone());
                    name
                }
            };
            dir.push(name);
        }
        fs::create_dir_all(&dir).map_err(|e| NotesError::Internal(e.to_string()))?;
        let name = claim(&dir, safe_dir_name(last), true);
        fs::write(dir.join(format!("{name}.md")), &file.content)
            .map_err(|e| NotesError::Internal(e.to_string()))?;
        written += 1;
    }
    Ok(ExportReport {
        folder: root.display().to_string(),
        written,
    })
}
