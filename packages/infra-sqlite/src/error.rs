use std::fmt;

/// Tudo que pode dar errado ao abrir e migrar o banco.
///
/// Em Rust, erros são valores: funções devolvem `Result<T, DbError>` e quem chama decide o que
/// fazer. Um `enum` lista cada tipo de falha, e o compilador obriga a tratar todos os casos.
#[derive(Debug)]
pub enum DbError {
    /// Erro genérico vindo do SQLite.
    Sqlite(rusqlite::Error),
    /// Erro de arquivo (criar pasta de backup, copiar, apagar).
    Io(std::io::Error),
    /// O arquivo existe, mas não é um banco íntegro. Nada foi alterado.
    Corrupted(String),
    DuplicateModule(String),
    MissingDependency {
        module: String,
        dependency: String,
    },
    DependencyCycle(Vec<String>),
    InvalidVersions {
        module: String,
        reason: String,
    },
    /// Uma migração já aplicada foi editada depois (o conteúdo não bate com o registrado).
    ChecksumMismatch {
        module: String,
        version: u32,
    },
    /// O banco tem uma migração que este app não conhece (banco mais novo que o app).
    UnknownAppliedMigration {
        module: String,
        version: u32,
    },
    /// Uma migração falhou. Ela foi desfeita por completo (transação).
    MigrationFailed {
        module: String,
        version: u32,
        source: rusqlite::Error,
    },
}

impl fmt::Display for DbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DbError::Sqlite(e) => write!(f, "erro do SQLite: {e}"),
            DbError::Io(e) => write!(f, "erro de arquivo: {e}"),
            DbError::Corrupted(why) => write!(f, "banco de dados corrompido ou inválido: {why}"),
            DbError::DuplicateModule(m) => write!(f, "módulo duplicado nas migrações: \"{m}\""),
            DbError::MissingDependency { module, dependency } => write!(
                f,
                "o módulo \"{module}\" depende de \"{dependency}\", que não tem migrações cadastradas"
            ),
            DbError::DependencyCycle(path) => {
                write!(
                    f,
                    "ciclo de dependências entre módulos: {}",
                    path.join(" → ")
                )
            }
            DbError::InvalidVersions { module, reason } => {
                write!(f, "versões de migração inválidas em \"{module}\": {reason}")
            }
            DbError::ChecksumMismatch { module, version } => write!(
                f,
                "a migração {module}:{version} já foi aplicada e foi editada depois; \
                 crie uma nova migração em vez de alterar a antiga"
            ),
            DbError::UnknownAppliedMigration { module, version } => write!(
                f,
                "o banco contém a migração {module}:{version}, que este app desconhece \
                 (o banco é mais novo que o app?)"
            ),
            DbError::MigrationFailed {
                module,
                version,
                source,
            } => write!(
                f,
                "a migração {module}:{version} falhou e foi desfeita: {source}"
            ),
        }
    }
}

impl std::error::Error for DbError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            DbError::Sqlite(e) => Some(e),
            DbError::Io(e) => Some(e),
            DbError::MigrationFailed { source, .. } => Some(source),
            _ => None,
        }
    }
}

// `From` permite usar o operador `?`: ele converte o erro automaticamente.
impl From<rusqlite::Error> for DbError {
    fn from(e: rusqlite::Error) -> Self {
        DbError::Sqlite(e)
    }
}

impl From<std::io::Error> for DbError {
    fn from(e: std::io::Error) -> Self {
        DbError::Io(e)
    }
}
