//! Dados do nome antigo ("Aesthetic Ugly Notes"). Quando o aplicativo mudou de nome, o identificador mudou de
//! `dev.aun.notes` para `dev.aesthetic.notes`, e com ele a pasta de dados. Na primeira abertura com o nome novo,
//! os dados da pasta antiga são MOVIDOS (não copiados) para a nova, para ninguém perder nada.

use std::fs;
use std::io;
use std::path::Path;

/// Nome do banco antes e depois da mudança.
pub const LEGACY_DB: &str = "aesthetic-ugly-notes.db";
pub const CURRENT_DB: &str = "aesthetic-notes.db";

/// O banco guarda mais dois arquivos ao lado (modo WAL); os três andam juntos.
const DB_SUFFIXES: [&str; 3] = ["", "-wal", "-shm"];

/// Move os dados de `legacy_dir` para `data_dir`, se houver o que mover e a pasta nova ainda não tiver banco.
/// Devolve `true` se moveu. Nunca sobrescreve nada que já exista na pasta nova.
///
/// Mover a pasta inteira (`rename`) é atômico no mesmo disco: ou tudo foi, ou nada foi.
pub fn migrate_legacy_data(data_dir: &Path, legacy_dir: &Path) -> io::Result<bool> {
    if data_dir.join(CURRENT_DB).exists() || !legacy_dir.join(LEGACY_DB).exists() {
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
        let from = data_dir.join(format!("{LEGACY_DB}{suffix}"));
        let to = data_dir.join(format!("{CURRENT_DB}{suffix}"));
        if from.exists() && !to.exists() {
            fs::rename(from, to)?;
        }
    }
    Ok(true)
}
