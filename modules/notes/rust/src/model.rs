use serde::Serialize;

/// Resumo de uma nota para listagens: não carrega o corpo, que pode ser grande.
/// `camelCase` faz o JSON sair como o TypeScript espera (`updatedAt`, não `updated_at`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub pinned: bool,
    pub updated_at: i64,
}
