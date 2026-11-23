use tramion_notes::diagnostics::{MAX_REPORT_CHARS, format_report};

#[test]
fn mantem_o_texto_e_acrescenta_o_prefixo() {
    assert_eq!(
        format_report("algo falhou\nlinha 2"),
        "[erro da tela] algo falhou\nlinha 2"
    );
}

#[test]
fn troca_caracteres_de_controle_mas_mantem_quebras_de_linha() {
    let report = format_report("a\u{1b}[31mb\u{7}c\nd\u{0}e");

    assert_eq!(report, "[erro da tela] a [31mb c\nd e");
    assert!(!report.chars().any(|c| c.is_control() && c != '\n'));
}

#[test]
fn corta_relatorios_gigantes() {
    let report = format_report(&"x".repeat(MAX_REPORT_CHARS * 3));

    assert!(report.ends_with("… (cortado)"));
    assert!(report.chars().count() < MAX_REPORT_CHARS + 40);
}

#[test]
fn texto_no_limite_nao_e_cortado() {
    let report = format_report(&"x".repeat(MAX_REPORT_CHARS));

    assert!(!report.contains("cortado"));
}

#[test]
fn conta_caracteres_e_nao_bytes() {
    let report = format_report(&"é".repeat(MAX_REPORT_CHARS));

    assert!(
        !report.contains("cortado"),
        "4000 caracteres acentuados cabem"
    );
}
