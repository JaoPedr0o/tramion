use serde::Serialize;

/// Uma nota (página) completa. `camelCase` faz o JSON sair como o TypeScript espera.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub body: String,
    pub pinned: bool,
    pub created_at: i64,
    /// Muda a cada edição de título ou corpo. Serve de "versão" para detectar conflitos.
    /// Fixar, mover, excluir e restaurar NÃO a alteram: organizar não é editar o conteúdo.
    pub updated_at: i64,
    /// `None` = ativa; preenchido = na lixeira.
    pub deleted_at: Option<i64>,
    /// Página-mãe. `None` = está na raiz.
    pub parent_id: Option<String>,
    /// Posição entre as irmãs, a partir de 0.
    pub position: i64,
}

/// Resumo para listagens: não carrega o corpo, que pode ser grande.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub pinned: bool,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    pub parent_id: Option<String>,
    pub position: i64,
}

/// Item da lixeira: só aparecem as RAÍZES de cada exclusão. As subpáginas excluídas junto não são
/// listadas; entram na contagem, para avisar o que "apagar de vez" leva junto.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashSummary {
    pub id: String,
    pub title: String,
    pub deleted_at: i64,
    pub descendant_count: i64,
}

/// Dados para criar uma nota.
#[derive(Debug, Clone)]
pub struct NewNote {
    pub title: String,
    pub body: String,
    /// `None` cria na raiz.
    pub parent_id: Option<String>,
}

/// Dados para editar uma nota.
#[derive(Debug, Clone)]
pub struct UpdateNote {
    pub id: String,
    pub title: String,
    pub body: String,
    /// O `updated_at` que quem edita viu ao abrir a nota. Se a nota já mudou, a edição é recusada.
    pub expected_updated_at: i64,
}

/// Dados para mover uma nota.
#[derive(Debug, Clone)]
pub struct MoveNote {
    pub id: String,
    /// `None` move para a raiz.
    pub new_parent_id: Option<String>,
    /// Posição desejada entre as irmãs do destino. Valores além do fim viram "no fim".
    pub index: usize,
}
