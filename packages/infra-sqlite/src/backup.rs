use crate::error::DbError;
use rusqlite::{Connection, params};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Cria uma cópia CONSISTENTE do banco antes de migrar e apaga as cópias mais antigas.
///
/// Usa `VACUUM INTO`, que o próprio SQLite executa de forma segura mesmo com o banco aberto
/// (copiar o arquivo "na mão" pode pegar o banco no meio de uma escrita).
///
/// O nome carrega o instante e quantas migrações o banco já tinha (`from0002`): assim cada
/// backup tem nome único e a ordenação por nome é a ordenação por data.
pub(crate) fn create_backup(
    conn: &Connection,
    db_path: &Path,
    backup_dir: &Path,
    applied_count: usize,
    keep: usize,
) -> Result<PathBuf, DbError> {
    fs::create_dir_all(backup_dir)?;
    let stem = stem_of(db_path);
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let target = backup_dir.join(format!("{stem}-{millis:013}-from{applied_count:04}.db"));

    let target_text = target.to_string_lossy();
    conn.execute("VACUUM INTO ?1", params![target_text.as_ref()])?;

    prune(backup_dir, &stem, keep)?;
    Ok(target)
}

fn stem_of(db_path: &Path) -> String {
    db_path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "database".to_string())
}

/// Mantém só os `keep` backups mais recentes deste banco.
fn prune(backup_dir: &Path, stem: &str, keep: usize) -> Result<(), DbError> {
    let prefix = format!("{stem}-");
    let mut backups: Vec<PathBuf> = fs::read_dir(backup_dir)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with(&prefix) && n.ends_with(".db"))
        })
        .collect();

    backups.sort();
    let excess = backups.len().saturating_sub(keep);
    for old in backups.into_iter().take(excess) {
        fs::remove_file(old)?;
    }
    Ok(())
}
