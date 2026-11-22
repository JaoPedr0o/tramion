use crate::backup;
use crate::error::DbError;
use crate::migration::{ModuleMigrations, checksum, order_modules};
use rusqlite::{Connection, ErrorCode, params};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Opções de abertura do banco em arquivo.
#[derive(Debug, Clone)]
pub struct OpenOptions {
    /// Pasta dos backups feitos antes de migrar. `None` desliga os backups.
    pub backup_dir: Option<PathBuf>,
    /// Quantos backups manter.
    pub backups_to_keep: usize,
}

impl Default for OpenOptions {
    fn default() -> Self {
        Self {
            backup_dir: None,
            backups_to_keep: 5,
        }
    }
}

/// O banco como o app o compartilha entre comandos: o `Mutex` garante um acesso por vez.
/// (Uma única conexão basta para um app local e evita problemas de escrita concorrente.)
pub type SharedDatabase = std::sync::Mutex<Database>;

/// Um banco aberto, íntegro e com todas as migrações aplicadas.
/// Só existe se tudo isso deu certo: não há como obter um `Database` "pela metade".
pub struct Database {
    conn: Connection,
}

impl Database {
    /// Abre (ou cria) o banco em `path`, confere a integridade, faz backup se houver
    /// migrações pendentes e as aplica na ordem das dependências.
    pub fn open(
        path: &Path,
        modules: &[ModuleMigrations],
        options: &OpenOptions,
    ) -> Result<Self, DbError> {
        // Valida as migrações ANTES de tocar no arquivo.
        let ordered = order_modules(modules)?;

        let mut conn = Connection::open(path).map_err(classify)?;
        check_integrity(&conn)?;
        configure(&conn, true)?;

        let backup = options
            .backup_dir
            .as_deref()
            .map(|dir| (path, dir, options.backups_to_keep));
        migrate(&mut conn, &ordered, backup)?;
        Ok(Self { conn })
    }

    /// Banco temporário em memória (testes). Não há o que preservar, então não faz backup.
    pub fn open_in_memory(modules: &[ModuleMigrations]) -> Result<Self, DbError> {
        let ordered = order_modules(modules)?;
        let mut conn = Connection::open_in_memory()?;
        configure(&conn, false)?;
        migrate(&mut conn, &ordered, None)?;
        Ok(Self { conn })
    }

    /// Conexão para os repositórios dos módulos usarem.
    pub fn connection(&self) -> &Connection {
        &self.conn
    }

    pub fn connection_mut(&mut self) -> &mut Connection {
        &mut self.conn
    }
}

/// Distingue "arquivo que não é um banco" de outros erros.
fn classify(error: rusqlite::Error) -> DbError {
    match &error {
        rusqlite::Error::SqliteFailure(e, _)
            if matches!(e.code, ErrorCode::NotADatabase | ErrorCode::DatabaseCorrupt) =>
        {
            DbError::Corrupted(error.to_string())
        }
        _ => DbError::Sqlite(error),
    }
}

fn check_integrity(conn: &Connection) -> Result<(), DbError> {
    let report: Vec<String> = conn
        .prepare("PRAGMA integrity_check")
        .and_then(|mut stmt| stmt.query_map([], |row| row.get(0))?.collect())
        .map_err(classify)?;
    if report == ["ok"] {
        Ok(())
    } else {
        Err(DbError::Corrupted(report.join("; ")))
    }
}

fn configure(conn: &Connection, wal: bool) -> Result<(), DbError> {
    // O SQLite, por padrão, NÃO impõe chaves estrangeiras: é preciso pedir a cada conexão.
    // A build "bundled" do rusqlite já liga isso por padrão (SQLITE_DEFAULT_FOREIGN_KEYS=1),
    // então esta linha hoje é redundante. Mantemos explícita para não depender de um detalhe
    // de build que pode mudar (por exemplo, se um dia usarmos o SQLite do sistema).
    conn.pragma_update(None, "foreign_keys", true)?;
    conn.busy_timeout(Duration::from_secs(5))?;
    if wal {
        // WAL: leituras não bloqueiam escrita e a escrita é mais resistente a quedas.
        conn.pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get::<_, String>(0))?;
    }
    Ok(())
}

fn migrate(
    conn: &mut Connection,
    ordered: &[&ModuleMigrations],
    backup: Option<(&Path, &Path, usize)>,
) -> Result<(), DbError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            module     TEXT    NOT NULL,
            version    INTEGER NOT NULL,
            checksum   TEXT    NOT NULL,
            applied_at TEXT    NOT NULL,
            PRIMARY KEY (module, version)
        );",
    )?;

    let applied = load_applied(conn)?;
    verify_applied(&applied, ordered)?;

    let pending: Vec<_> = ordered
        .iter()
        .flat_map(|set| {
            set.migrations
                .iter()
                .map(move |migration| (set.module, migration))
        })
        .filter(|(module, migration)| {
            !applied.contains_key(&(module.to_string(), migration.version))
        })
        .collect();

    if pending.is_empty() {
        return Ok(());
    }

    // Backup só faz sentido se já existe algo a perder (banco novo está vazio).
    if let Some((db_path, backup_dir, keep)) = backup
        && !applied.is_empty()
    {
        backup::create_backup(conn, db_path, backup_dir, applied.len(), keep)?;
    }

    for (module, migration) in pending {
        // Cada migração roda numa transação: ou entra inteira, ou nada muda.
        // Se `?` sair da função antes do commit, a transação é desfeita ao ser descartada.
        let tx = conn.transaction()?;
        tx.execute_batch(migration.sql)
            .map_err(|source| DbError::MigrationFailed {
                module: module.to_string(),
                version: migration.version,
                source,
            })?;
        tx.execute(
            "INSERT INTO _migrations (module, version, checksum, applied_at)
             VALUES (?1, ?2, ?3, datetime('now'))",
            params![module, migration.version, checksum(migration.sql)],
        )?;
        tx.commit()?;
    }
    Ok(())
}

type Applied = HashMap<(String, u32), String>;

fn load_applied(conn: &Connection) -> Result<Applied, DbError> {
    let mut stmt = conn.prepare("SELECT module, version, checksum FROM _migrations")?;
    let rows = stmt.query_map([], |row| {
        Ok((
            (row.get::<_, String>(0)?, row.get::<_, u32>(1)?),
            row.get::<_, String>(2)?,
        ))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Confere se o que o banco diz ter aplicado bate com as migrações que este app conhece.
fn verify_applied(applied: &Applied, ordered: &[&ModuleMigrations]) -> Result<(), DbError> {
    for ((module, version), recorded) in applied {
        let known = ordered
            .iter()
            .find(|set| set.module == module)
            .and_then(|set| set.migrations.iter().find(|m| m.version == *version));
        match known {
            None => {
                return Err(DbError::UnknownAppliedMigration {
                    module: module.clone(),
                    version: *version,
                });
            }
            Some(migration) if checksum(migration.sql) != *recorded => {
                return Err(DbError::ChecksumMismatch {
                    module: module.clone(),
                    version: *version,
                });
            }
            Some(_) => {}
        }
    }
    Ok(())
}
