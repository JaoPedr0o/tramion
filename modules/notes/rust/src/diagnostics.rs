//! Diagnóstico: erros da interface registrados no terminal do app, para que uma falha na tela não suma sem rastro.

/// Máximo de caracteres de um relatório (um erro de interface com pilha de chamadas pode ser enorme).
pub const MAX_REPORT_CHARS: usize = 4000;

/// Prepara o texto de um erro da interface para o terminal: limita o tamanho e troca caracteres de controle
/// (que poderiam bagunçar o terminal), mantendo as quebras de linha.
pub fn format_report(message: &str) -> String {
    let cleaned: String = message
        .chars()
        .map(|c| if c.is_control() && c != '\n' { ' ' } else { c })
        .collect();
    let mut limited: String = cleaned.chars().take(MAX_REPORT_CHARS).collect();
    if cleaned.chars().count() > MAX_REPORT_CHARS {
        limited.push_str("… (cortado)");
    }
    format!("[erro da tela] {limited}")
}
