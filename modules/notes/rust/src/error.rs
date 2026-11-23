use std::fmt;
use tramion_infra_sqlite::rusqlite;

/// O que pode dar errado nas operações de notas.
///
/// Cada variante tem um [`code`](NotesError::code) estável: é ele que a interface usa para escolher
/// a mensagem ao usuário. O texto de `Display` é técnico, para logs.
#[derive(Debug)]
pub enum NotesError {
    TitleEmpty,
    TitleTooLong {
        max: usize,
    },
    /// O conteúdo não é uma lista de blocos em JSON válido.
    ContentInvalid,
    ContentTooLarge {
        max: usize,
    },
    /// O endereço não é um link http(s) válido.
    UrlInvalid,
    /// O símbolo da página não é válido (vazio, longo demais ou com caracteres de controle).
    IconInvalid,
    /// A capa da página não está num formato aceito.
    CoverInvalid,
    /// A página não é uma base de dados.
    NotDatabase,
    /// A coluna não existe.
    PropertyNotFound,
    /// O nome, o tipo ou as opções da coluna não são válidos.
    PropertyInvalid,
    /// O valor não serve para o tipo da coluna (ou a linha não pertence à base).
    CellInvalid,
    /// Limite de colunas da base atingido.
    LimitReached {
        max: usize,
    },
    /// O arquivo enviado é grande demais.
    AssetTooLarge {
        max: usize,
    },
    /// O tipo do arquivo enviado não é aceito.
    AssetTypeNotAllowed,
    /// O conteúdo do arquivo não bate com o tipo que ele diz ter.
    AssetInvalid,
    NotFound,
    /// A nota está na lixeira e a operação só vale para notas ativas.
    InTrash,
    /// A operação só vale para notas na lixeira (excluir de vez).
    NotInTrash,
    /// A página de destino não existe.
    ParentNotFound,
    /// A página de destino está na lixeira.
    ParentInTrash,
    /// Mover a página para dentro dela mesma ou de uma descendente criaria um ciclo.
    Cycle,
    /// A nota mudou desde que o chamador a leu. `current_updated_at` é a versão atual.
    Conflict {
        current_updated_at: i64,
    },
    Storage(rusqlite::Error),
    Internal(String),
}

impl NotesError {
    pub fn code(&self) -> &'static str {
        match self {
            NotesError::TitleEmpty => "notes.title-empty",
            NotesError::TitleTooLong { .. } => "notes.title-too-long",
            NotesError::UrlInvalid => "notes.url-invalid",
            NotesError::IconInvalid => "notes.icon-invalid",
            NotesError::CoverInvalid => "notes.cover-invalid",
            NotesError::NotDatabase => "notes.not-database",
            NotesError::PropertyNotFound => "notes.property-not-found",
            NotesError::PropertyInvalid => "notes.property-invalid",
            NotesError::CellInvalid => "notes.cell-invalid",
            NotesError::LimitReached { .. } => "notes.limit-reached",
            NotesError::AssetTooLarge { .. } => "notes.asset-too-large",
            NotesError::AssetTypeNotAllowed => "notes.asset-type-not-allowed",
            NotesError::AssetInvalid => "notes.asset-invalid",
            NotesError::ContentInvalid => "notes.content-invalid",
            NotesError::ContentTooLarge { .. } => "notes.content-too-large",
            NotesError::NotFound => "notes.not-found",
            NotesError::InTrash => "notes.in-trash",
            NotesError::NotInTrash => "notes.not-in-trash",
            NotesError::ParentNotFound => "notes.parent-not-found",
            NotesError::ParentInTrash => "notes.parent-in-trash",
            NotesError::Cycle => "notes.cycle",
            NotesError::Conflict { .. } => "notes.conflict",
            NotesError::Storage(_) | NotesError::Internal(_) => "notes.internal",
        }
    }
}

impl fmt::Display for NotesError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            NotesError::TitleEmpty => write!(f, "o título não pode ser vazio"),
            NotesError::TitleTooLong { max } => {
                write!(f, "o título excede o máximo de {max} caracteres")
            }
            NotesError::UrlInvalid => write!(f, "o endereço não é um link http ou https válido"),
            NotesError::IconInvalid => write!(f, "o símbolo da página não é válido"),
            NotesError::CoverInvalid => write!(f, "a capa da página não está num formato aceito"),
            NotesError::NotDatabase => write!(f, "a página não é uma base de dados"),
            NotesError::PropertyNotFound => write!(f, "coluna não encontrada"),
            NotesError::PropertyInvalid => write!(f, "a coluna não é válida"),
            NotesError::CellInvalid => write!(f, "o valor não serve para esta coluna"),
            NotesError::LimitReached { max } => write!(f, "limite de {max} colunas atingido"),
            NotesError::AssetTooLarge { max } => {
                write!(f, "o arquivo excede o máximo de {max} bytes")
            }
            NotesError::AssetTypeNotAllowed => write!(f, "tipo de arquivo não aceito"),
            NotesError::AssetInvalid => write!(f, "o arquivo não corresponde ao tipo informado"),
            NotesError::ContentInvalid => write!(f, "o conteúdo não é uma lista de blocos válida"),
            NotesError::ContentTooLarge { max } => {
                write!(f, "o conteúdo excede o máximo de {max} bytes")
            }
            NotesError::NotFound => write!(f, "nota não encontrada"),
            NotesError::InTrash => write!(f, "a nota está na lixeira"),
            NotesError::NotInTrash => write!(f, "a nota não está na lixeira"),
            NotesError::ParentNotFound => write!(f, "a página de destino não existe"),
            NotesError::ParentInTrash => write!(f, "a página de destino está na lixeira"),
            NotesError::Cycle => {
                write!(f, "não é possível mover uma página para dentro dela mesma")
            }
            NotesError::Conflict { current_updated_at } => write!(
                f,
                "a nota foi alterada por outra edição (versão atual: {current_updated_at})"
            ),
            NotesError::Storage(e) => write!(f, "erro de armazenamento: {e}"),
            NotesError::Internal(why) => write!(f, "erro interno: {why}"),
        }
    }
}

impl std::error::Error for NotesError {}

impl From<rusqlite::Error> for NotesError {
    fn from(e: rusqlite::Error) -> Self {
        NotesError::Storage(e)
    }
}
