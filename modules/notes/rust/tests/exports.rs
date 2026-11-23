use std::fs;
use tempfile::tempdir;
use tramion_notes::error::NotesError;
use tramion_notes::exports::{MAX_EXPORT_BYTES, safe_file_name, save_markdown, unique_path};

#[test]
fn nome_seguro_tira_separadores_proibidos_e_controle() {
    assert_eq!(safe_file_name("Notas de reunião"), "Notas de reunião.md");
    assert_eq!(
        safe_file_name("a/b\\c:d*e?f\"g<h>i|j"),
        "a b c d e f g h i j.md"
    );
    assert_eq!(safe_file_name("../../etc/passwd"), "etc passwd.md");
    assert_eq!(
        safe_file_name("linha\nquebrada\ttab"),
        "linha quebrada tab.md"
    );
    assert_eq!(safe_file_name("  muitos    espaços  "), "muitos espaços.md");
}

#[test]
fn nome_nunca_fica_vazio_nem_so_pontos() {
    assert_eq!(safe_file_name(""), "Sem título.md");
    assert_eq!(safe_file_name("   "), "Sem título.md");
    assert_eq!(safe_file_name("..."), "Sem título.md");
    assert_eq!(safe_file_name("///"), "Sem título.md");
    assert_eq!(safe_file_name(".oculto"), "oculto.md");
}

#[test]
fn nome_e_cortado_em_100_caracteres_sem_quebrar_acentos() {
    let name = safe_file_name(&"é".repeat(300));

    assert_eq!(name.chars().count(), 100 + ".md".len());
    assert!(name.ends_with(".md"));
}

#[test]
fn nome_unico_acrescenta_numero_quando_ja_existe() {
    let dir = tempdir().unwrap();

    assert_eq!(unique_path(dir.path(), "A.md"), dir.path().join("A.md"));
    fs::write(dir.path().join("A.md"), "x").unwrap();
    assert_eq!(unique_path(dir.path(), "A.md"), dir.path().join("A (2).md"));
    fs::write(dir.path().join("A (2).md"), "x").unwrap();
    assert_eq!(unique_path(dir.path(), "A.md"), dir.path().join("A (3).md"));
}

#[test]
fn grava_o_arquivo_cria_a_pasta_e_nao_sobrescreve() {
    let root = tempdir().unwrap();
    let dir = root.path().join("Downloads");

    let first = save_markdown(&dir, "Minha página", "# Olá\n").unwrap();
    let second = save_markdown(&dir, "Minha página", "# Outra\n").unwrap();

    assert_eq!(first, dir.join("Minha página.md"));
    assert_eq!(second, dir.join("Minha página (2).md"));
    assert_eq!(fs::read_to_string(first).unwrap(), "# Olá\n");
    assert_eq!(fs::read_to_string(second).unwrap(), "# Outra\n");
}

#[test]
fn titulo_malicioso_nao_escapa_da_pasta() {
    let dir = tempdir().unwrap();

    let path = save_markdown(dir.path(), "../../fora", "x").unwrap();

    assert_eq!(path.parent().unwrap(), dir.path());
}

#[test]
fn recusa_conteudo_gigante() {
    let dir = tempdir().unwrap();

    let result = save_markdown(dir.path(), "G", &"x".repeat(MAX_EXPORT_BYTES + 1));

    assert!(matches!(result, Err(NotesError::ContentTooLarge { .. })));
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
}
