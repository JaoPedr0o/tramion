//! Testes da busca global.

use tramion_infra_sqlite::Database;
use tramion_notes::MIGRATIONS;
use tramion_notes::database;
use tramion_notes::model::{NewNote, UpdateNote};
use tramion_notes::search::{MAX_LIMIT, fold, search};
use tramion_notes::service;

fn db() -> Database {
    Database::open_in_memory(&[MIGRATIONS]).expect("as migrações reais devem aplicar")
}

fn page(db: &Database, title: &str, body: &str) -> String {
    let note = service::create(
        db.connection(),
        NewNote {
            title: title.into(),
            body: String::new(),
            parent_id: None,
        },
    )
    .unwrap();
    service::update(
        db.connection(),
        UpdateNote {
            id: note.id.clone(),
            title: title.into(),
            body: body.into(),
            content: "[]".into(),
            expected_updated_at: note.updated_at,
        },
    )
    .unwrap();
    note.id
}

fn titles(db: &Database, query: &str) -> Vec<String> {
    search(db.connection(), query, 20)
        .unwrap()
        .into_iter()
        .map(|h| h.title)
        .collect()
}

#[test]
fn fold_tira_acentos_e_maiusculas_mantendo_o_tamanho() {
    assert_eq!(fold("AÇÃO é Ótima, Pão!"), "acao e otima, pao!");
    assert_eq!(fold("ÀÉÎÕÜ ñ"), "aeiou n");
    assert_eq!(fold("日本語").chars().count(), 3);
    assert_eq!(fold("Straße").chars().count(), "Straße".chars().count());
}

#[test]
fn busca_vazia_ou_so_espacos_nao_devolve_nada() {
    let db = db();
    page(&db, "Algo", "texto");

    assert!(search(db.connection(), "", 20).unwrap().is_empty());
    assert!(search(db.connection(), "   \t ", 20).unwrap().is_empty());
}

#[test]
fn ignora_acento_e_maiuscula_no_titulo_e_no_texto() {
    let db = db();
    page(&db, "Ação judicial", "");
    page(&db, "Outra", "Preciso comprar PÃO amanhã");

    assert_eq!(titles(&db, "acao"), ["Ação judicial"]);
    assert_eq!(titles(&db, "AÇÃO"), ["Ação judicial"]);
    assert_eq!(titles(&db, "pao"), ["Outra"]);
}

#[test]
fn todas_as_palavras_precisam_aparecer_em_qualquer_ordem_e_lugar() {
    let db = db();
    page(&db, "Receita de bolo", "farinha, ovos e açúcar");
    page(&db, "Lista de mercado", "ovos e leite");

    assert_eq!(titles(&db, "bolo ovos"), ["Receita de bolo"]);
    assert_eq!(titles(&db, "ovos bolo"), ["Receita de bolo"]);
    let mut both = titles(&db, "ovos");
    both.sort();
    assert_eq!(both, ["Lista de mercado", "Receita de bolo"]);
    assert!(titles(&db, "bolo leite").is_empty());
}

#[test]
fn titulo_vem_antes_do_texto_e_igual_antes_de_comeca_com() {
    let db = db();
    page(&db, "Notas de reunião", "falamos sobre projeto");
    page(&db, "Meu projeto", "");
    page(&db, "Projeto", "");
    page(&db, "Projetos antigos", "");

    assert_eq!(
        titles(&db, "projeto"),
        [
            "Projeto",
            "Projetos antigos",
            "Meu projeto",
            "Notas de reunião"
        ]
    );
}

#[test]
fn resultado_traz_trecho_do_texto_em_uma_linha_com_reticencias() {
    let db = db();
    let body = format!(
        "{} alvo especial {}",
        "começo ".repeat(20),
        "fim ".repeat(40)
    );
    page(&db, "Longa", &format!("linha um\n{body}"));

    let hits = search(db.connection(), "alvo", 20).unwrap();

    assert_eq!(hits.len(), 1);
    assert!(hits[0].snippet.contains("alvo especial"));
    assert!(hits[0].snippet.starts_with('…') && hits[0].snippet.ends_with('…'));
    assert!(!hits[0].snippet.contains('\n'));
    assert!(hits[0].snippet.chars().count() < 120);
    assert!(!hits[0].in_title);
}

#[test]
fn texto_curto_sem_cortes_nao_tem_reticencias_e_titulo_marca_in_title() {
    let db = db();
    page(&db, "Mercado", "leite e pão");

    let hits = search(db.connection(), "mercado", 20).unwrap();

    assert!(hits[0].in_title);
    assert_eq!(hits[0].snippet, "leite e pão");
}

#[test]
fn lixeira_fica_de_fora_e_voltar_da_lixeira_traz_de_volta() {
    let db = db();
    let id = page(&db, "Segredo", "conteúdo");
    service::delete(db.connection(), &id).unwrap();

    assert!(titles(&db, "segredo").is_empty());

    service::restore(db.connection(), &id).unwrap();
    assert_eq!(titles(&db, "segredo"), ["Segredo"]);
}

#[test]
fn bases_e_suas_linhas_aparecem_e_a_base_vem_marcada() {
    let db = db();
    let base = database::create_database(db.connection(), "Tarefas", None).unwrap();
    database::create_row(db.connection(), &base.id, "Tarefa do mês").unwrap();

    let hits = search(db.connection(), "tarefa", 20).unwrap();

    assert_eq!(hits.len(), 2);
    assert!(
        hits.iter()
            .find(|h| h.title == "Tarefas")
            .unwrap()
            .is_database
    );
    assert!(
        !hits
            .iter()
            .find(|h| h.title == "Tarefa do mês")
            .unwrap()
            .is_database
    );
}

#[test]
fn limite_e_respeitado_e_limitado_ao_maximo() {
    let db = db();
    for i in 0..60 {
        page(&db, &format!("Item {i}"), "");
    }

    assert_eq!(search(db.connection(), "item", 5).unwrap().len(), 5);
    assert_eq!(
        search(db.connection(), "item", 1000).unwrap().len(),
        MAX_LIMIT
    );
    assert_eq!(
        search(db.connection(), "item", 0).unwrap().len(),
        1,
        "pelo menos 1"
    );
}

#[test]
fn busca_muito_longa_e_cortada_sem_quebrar() {
    let db = db();
    page(&db, "Curta", "");

    assert!(
        search(db.connection(), &"x".repeat(5000), 20)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn simbolo_vem_no_resultado() {
    let db = db();
    let id = page(&db, "Com ícone", "");
    service::set_appearance(db.connection(), &id, Some("🚀"), None).unwrap();

    assert_eq!(
        search(db.connection(), "icone", 20).unwrap()[0]
            .icon
            .as_deref(),
        Some("🚀")
    );
}

#[test]
fn acha_linhas_de_bases_pelo_que_esta_nas_colunas_com_trecho() {
    let db = db();
    let base = database::create_database(db.connection(), "Clientes", None).unwrap();
    let nome = database::add_property(db.connection(), &base.id, "Cidade", "text").unwrap();
    let status = database::add_property(db.connection(), &base.id, "Status", "select").unwrap();
    database::update_property(
        db.connection(),
        &status.id,
        None,
        Some(&serde_json::json!([{ "id": "x1", "name": "Em negociação", "color": "blue" }])),
    )
    .unwrap();
    let linha = database::create_row(db.connection(), &base.id, "Maria").unwrap();
    database::set_cell(
        db.connection(),
        &linha.id,
        &nome.id,
        &serde_json::json!("São Paulo"),
    )
    .unwrap();
    database::set_cell(
        db.connection(),
        &linha.id,
        &status.id,
        &serde_json::json!("x1"),
    )
    .unwrap();

    let by_city = search(db.connection(), "sao paulo", 20).unwrap();
    let by_option = search(db.connection(), "negociacao", 20).unwrap();

    assert_eq!(by_city.len(), 1);
    assert_eq!(by_city[0].title, "Maria");
    assert!(by_city[0].snippet.contains("Cidade: São Paulo"));
    assert!(by_city[0].snippet.contains("Status: Em negociação"));
    assert_eq!(
        by_option[0].title, "Maria",
        "seleção entra pelo nome da opção, não pelo id"
    );
    assert!(
        search(db.connection(), "x1", 20).unwrap().is_empty(),
        "o id interno da opção não é buscável"
    );
}

#[test]
fn celulas_de_numero_entram_e_linhas_apagadas_ou_de_bases_na_lixeira_nao() {
    let db = db();
    let base = database::create_database(db.connection(), "Notas", None).unwrap();
    let valor = database::add_property(db.connection(), &base.id, "Valor", "number").unwrap();
    let viva = database::create_row(db.connection(), &base.id, "Viva").unwrap();
    let morta = database::create_row(db.connection(), &base.id, "Morta").unwrap();
    database::set_cell(
        db.connection(),
        &viva.id,
        &valor.id,
        &serde_json::json!(1234.5),
    )
    .unwrap();
    database::set_cell(
        db.connection(),
        &morta.id,
        &valor.id,
        &serde_json::json!(1234.5),
    )
    .unwrap();
    service::delete(db.connection(), &morta.id).unwrap();

    assert_eq!(titles(&db, "1234.5"), ["Viva"]);

    service::delete(db.connection(), &base.id).unwrap();
    assert!(titles(&db, "1234.5").is_empty());
}

#[test]
fn texto_da_pagina_e_celulas_juntos_nao_atrapalham_o_titulo_primeiro() {
    let db = db();
    let base = database::create_database(db.connection(), "B", None).unwrap();
    let coluna = database::add_property(db.connection(), &base.id, "Obs", "text").unwrap();
    let linha = database::create_row(db.connection(), &base.id, "Pão de queijo").unwrap();
    database::set_cell(
        db.connection(),
        &linha.id,
        &coluna.id,
        &serde_json::json!("receita"),
    )
    .unwrap();
    page(&db, "Receita", "");

    assert_eq!(
        titles(&db, "receita"),
        ["Receita", "Pão de queijo"],
        "título vale mais que célula"
    );
}
