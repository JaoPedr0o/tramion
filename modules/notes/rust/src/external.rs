//! Abrir links no navegador do sistema, com validação: só `http` e `https`.

use crate::error::NotesError;

/// Confere que o texto é um endereço `http://` ou `https://` sem caracteres de controle nem espaços.
/// Recusa `javascript:`, `file:`, `data:` e qualquer outro esquema: a interface não pode pedir ao
/// sistema para abrir coisas arbitrárias.
pub fn validate_external_url(url: &str) -> Result<&str, NotesError> {
    let lower = url.to_ascii_lowercase();
    let has_scheme = lower.starts_with("https://") || lower.starts_with("http://");
    let host_part = url.split_once("://").map(|(_, rest)| rest).unwrap_or("");
    let clean = !url.chars().any(|c| c.is_control() || c.is_whitespace());

    if has_scheme && clean && !host_part.is_empty() && !host_part.starts_with('/') {
        Ok(url)
    } else {
        Err(NotesError::UrlInvalid)
    }
}

/// Abre o endereço no navegador padrão.
pub fn open_external(url: &str) -> Result<(), NotesError> {
    let url = validate_external_url(url)?;
    open::that_detached(url).map_err(|error| NotesError::Internal(error.to_string()))
}
