//! Arquivos enviados pelo usuário (imagens, vídeo e áudio): validados e guardados na pasta do app.

use crate::error::NotesError;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

/// Tamanho máximo de um arquivo enviado, em bytes.
pub const MAX_ASSET_BYTES: usize = 50_000_000;

/// Extensões aceitas. SVG fica de fora de propósito: pode carregar scripts.
const IMAGES: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "avif"];
const MEDIA: &[&str] = &["mp4", "webm", "mp3", "ogg", "wav"];

fn extension_of(file_name: &str) -> Option<String> {
    let (_, ext) = file_name.rsplit_once('.')?;
    let ext = ext.to_ascii_lowercase();
    (IMAGES.contains(&ext.as_str()) || MEDIA.contains(&ext.as_str())).then_some(ext)
}

/// Imagens têm uma "assinatura" nos primeiros bytes: confere que o conteúdo é mesmo uma imagem do tipo
/// que a extensão diz (não basta renomear um arquivo qualquer para `.png`).
fn matches_signature(ext: &str, bytes: &[u8]) -> bool {
    match ext {
        "png" => bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]),
        "jpg" | "jpeg" => bytes.starts_with(&[0xFF, 0xD8, 0xFF]),
        "gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "webp" => bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        "avif" => bytes.len() >= 12 && &bytes[4..8] == b"ftyp",
        _ => true, // vídeo e áudio: só a extensão e o tamanho
    }
}

/// Nome com que o arquivo é guardado: o resumo (SHA-256) do conteúdo mais a extensão. O mesmo arquivo
/// enviado duas vezes vira um só, e o nome original (que pode ter caminhos e símbolos) nunca é usado.
pub fn stored_name(file_name: &str, bytes: &[u8]) -> Result<String, NotesError> {
    if bytes.len() > MAX_ASSET_BYTES {
        return Err(NotesError::AssetTooLarge {
            max: MAX_ASSET_BYTES,
        });
    }
    let ext = extension_of(file_name).ok_or(NotesError::AssetTypeNotAllowed)?;
    if bytes.is_empty() || !matches_signature(&ext, bytes) {
        return Err(NotesError::AssetInvalid);
    }
    let digest: String = Sha256::digest(bytes)
        .iter()
        .take(16)
        .map(|b| format!("{b:02x}"))
        .collect();
    Ok(format!("{digest}.{ext}"))
}

/// Valida e grava o arquivo em `dir` (criada se preciso). Devolve o caminho completo.
pub fn store(dir: &Path, file_name: &str, bytes: &[u8]) -> Result<PathBuf, NotesError> {
    let name = stored_name(file_name, bytes)?;
    std::fs::create_dir_all(dir).map_err(|e| NotesError::Internal(e.to_string()))?;
    let path = dir.join(name);
    if !path.exists() {
        std::fs::write(&path, bytes).map_err(|e| NotesError::Internal(e.to_string()))?;
    }
    Ok(path)
}
