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

use tramion_notes::exports::{ExportFile, MAX_EXPORT_FILES, export_tree};

fn file(path: &[&str], content: &str) -> ExportFile {
    ExportFile {
        path: path.iter().map(|s| s.to_string()).collect(),
        content: content.to_string(),
    }
}

fn names(dir: &std::path::Path) -> Vec<String> {
    let mut found: Vec<String> = fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .collect();
    found.sort();
    found
}

#[test]
fn exporta_a_arvore_com_pastas_e_arquivos_md() {
    let root = tempdir().unwrap();
    let out = root.path().join("Tramion");

    let report = export_tree(
        &out,
        &[
            file(&["Pai"], "# Pai"),
            file(&["Pai", "Filha"], "# Filha"),
            file(&["Pai", "Filha", "Neta"], "# Neta"),
            file(&["Outra"], "# Outra"),
        ],
    )
    .unwrap();

    assert_eq!(report.written, 4);
    assert_eq!(names(&out), ["Outra.md", "Pai", "Pai.md"]);
    assert_eq!(names(&out.join("Pai")), ["Filha", "Filha.md"]);
    assert_eq!(
        fs::read_to_string(out.join("Pai/Filha/Neta.md")).unwrap(),
        "# Neta"
    );
}

#[test]
fn nomes_iguais_na_mesma_pasta_ganham_numero_sem_diferenciar_maiuscula() {
    let root = tempdir().unwrap();
    let out = root.path().join("Tramion");

    export_tree(
        &out,
        &[
            file(&["Nota"], "1"),
            file(&["nota"], "2"),
            file(&["NOTA"], "3"),
        ],
    )
    .unwrap();

    assert_eq!(names(&out), ["NOTA (3).md", "Nota.md", "nota (2).md"]);
}

#[test]
fn caminhos_perigosos_nao_saem_da_pasta() {
    let root = tempdir().unwrap();
    let out = root.path().join("Tramion");

    export_tree(
        &out,
        &[
            file(&["..", "..", "fora"], "x"),
            file(&["/etc", "passwd"], "y"),
            file(&["a/b", "c\\d"], "z"),
            file(&["..."], "w"),
        ],
    )
    .unwrap();

    // Tudo ficou dentro de `out`: nada foi criado ao lado dela.
    assert_eq!(names(root.path()), ["Tramion"]);
    fn count(dir: &std::path::Path) -> usize {
        fs::read_dir(dir)
            .unwrap()
            .map(|e| {
                let path = e.unwrap().path();
                if path.is_dir() { count(&path) } else { 1 }
            })
            .sum()
    }
    assert_eq!(count(&out), 4);
}

#[test]
fn exportar_de_novo_atualiza_os_arquivos_e_nao_apaga_o_resto() {
    let root = tempdir().unwrap();
    let out = root.path().join("Tramion");
    export_tree(&out, &[file(&["A"], "velho"), file(&["B"], "fica")]).unwrap();

    export_tree(&out, &[file(&["A"], "novo")]).unwrap();

    assert_eq!(fs::read_to_string(out.join("A.md")).unwrap(), "novo");
    assert_eq!(
        fs::read_to_string(out.join("B.md")).unwrap(),
        "fica",
        "nada é apagado"
    );
    assert_eq!(
        names(&out),
        ["A.md", "B.md"],
        "sem 'A (2).md': a exportação anterior é substituída"
    );
}

#[test]
fn caminho_vazio_e_lista_vazia_nao_fazem_nada() {
    let root = tempdir().unwrap();
    let out = root.path().join("Tramion");

    let report = export_tree(&out, &[file(&[], "x")]).unwrap();

    assert_eq!(report.written, 0);
    assert_eq!(export_tree(&out, &[]).unwrap().written, 0);
}

#[test]
fn limites_de_arquivos_e_de_tamanho() {
    let root = tempdir().unwrap();
    let out = root.path().join("Tramion");
    let many: Vec<ExportFile> = (0..=MAX_EXPORT_FILES)
        .map(|i| file(&[&format!("P{i}")], ""))
        .collect();

    assert!(matches!(
        export_tree(&out, &many),
        Err(NotesError::ContentTooLarge { .. })
    ));
    assert!(matches!(
        export_tree(&out, &[file(&["G"], &"x".repeat(MAX_EXPORT_BYTES + 1))]),
        Err(NotesError::ContentTooLarge { .. })
    ));
    assert!(!out.exists() || names(&out).is_empty(), "nada foi gravado");
}
