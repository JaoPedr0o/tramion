//! Dados dos nomes antigos do aplicativo. Cada mudança de nome mudou o identificador (e com ele a pasta de dados) e o
//! nome do banco. Na primeira abertura com o nome atual, os dados da pasta mais recente que existir são MOVIDOS
//! (não copiados) para a pasta nova, para ninguém perder nada.
//!
//! Gerações, da mais nova para a mais antiga:
//! 1. "Aesthetic Notes": `dev.aesthetic.notes` / `aesthetic-notes.db`
//! 2. "Aesthetic Ugly Notes": `dev.aun.notes` / `aesthetic-ugly-notes.db`

use std::fs;
use std::io;
use std::path::Path;

/// Nome do banco atual.
pub const CURRENT_DB: &str = "tramion.db";

/// Onde os dados ficavam em cada nome antigo: `(pasta de dados, banco)`, da geração mais nova para a mais antiga.
pub const LEGACY_LOCATIONS: [(&str, &str); 2] = [
    ("dev.aesthetic.notes", "aesthetic-notes.db"),
    ("dev.aun.notes", "aesthetic-ugly-notes.db"),
];

/// O banco guarda mais dois arquivos ao lado (modo WAL); os três andam juntos.
const DB_SUFFIXES: [&str; 3] = ["", "-wal", "-shm"];

/// Move os dados de `legacy_dir` (cujo banco se chama `legacy_db`) para `data_dir`, se houver o que mover e a pasta
/// nova ainda não tiver banco. Devolve `true` se moveu. Nunca sobrescreve nada que já exista na pasta nova.
///
/// Mover a pasta inteira (`rename`) é atômico no mesmo disco: ou tudo foi, ou nada foi.
pub fn migrate_legacy_data(
    data_dir: &Path,
    legacy_dir: &Path,
    legacy_db: &str,
) -> io::Result<bool> {
    if data_dir.join(CURRENT_DB).exists() || !legacy_dir.join(legacy_db).exists() {
        return Ok(false);
    }

    if !data_dir.exists() {
        if let Some(parent) = data_dir.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(legacy_dir, data_dir)?;
    } else {
        // A pasta nova já existe (por exemplo, criada vazia): leva cada item que ainda não esteja lá.
        for entry in fs::read_dir(legacy_dir)? {
            let entry = entry?;
            let target = data_dir.join(entry.file_name());
            if !target.exists() {
                fs::rename(entry.path(), target)?;
            }
        }
    }

    for suffix in DB_SUFFIXES {
        let from = data_dir.join(format!("{legacy_db}{suffix}"));
        let to = data_dir.join(format!("{CURRENT_DB}{suffix}"));
        if from.exists() && !to.exists() {
            fs::rename(from, to)?;
        }
    }
    Ok(true)
}

/// Procura os dados nas pastas dos nomes antigos (irmãs de `data_dir`) e move os da geração mais nova que existir.
/// Devolve o nome da pasta de onde moveu, se moveu.
pub fn migrate_from_any_legacy(data_dir: &Path) -> io::Result<Option<&'static str>> {
    let Some(parent) = data_dir.parent() else {
        return Ok(None);
    };
    for (dir_name, db_name) in LEGACY_LOCATIONS {
        if migrate_legacy_data(data_dir, &parent.join(dir_name), db_name)? {
            return Ok(Some(dir_name));
        }
    }
    Ok(None)
}
