//! Testes das páginas de exemplo da primeira abertura.

use serde_json::Value;
use tramion_infra_sqlite::Database;
use tramion_notes::MIGRATIONS;
use tramion_notes::database;
use tramion_notes::model::{NewNote, NoteSummary};
use tramion_notes::samples::{create_samples, seed_if_first_run};
use tramion_notes::service;

fn db() -> Database {
    Database::open_in_memory(&[MIGRATIONS]).expect("as migrações reais devem aplicar")
}

fn roots(db: &Database) -> Vec<NoteSummary> {
    service::list(db.connection())
        .unwrap()
        .into_iter()
        .filter(|n| n.parent_id.is_none())
        .collect()
}

fn titles(db: &Database) -> Vec<String> {
    roots(db).into_iter().map(|n| n.title).collect()
}

#[test]
fn banco_vazio_ganha_as_paginas_de_exemplo_uma_unica_vez() {
    let db = db();

    assert!(seed_if_first_run(db.connection()).unwrap());
    assert!(!seed_if_first_run(db.connection()).unwrap());

    assert_eq!(
        titles(&db),
        ["Comece por aqui", "Lista de tarefas", "Leituras", "Diário"]
    );
}

#[test]
fn cada_exemplo_tem_simbolo_e_as_bases_sao_marcadas_como_base() {
    let db = db();
    seed_if_first_run(db.connection()).unwrap();

    let by_title = |title: &str| roots(&db).into_iter().find(|n| n.title == title).unwrap();

    assert_eq!(by_title("Comece por aqui").icon.as_deref(), Some("👋"));
    assert!(by_title("Lista de tarefas").is_database);
    assert!(by_title("Leituras").is_database);
    assert!(!by_title("Comece por aqui").is_database);
    assert!(!by_title("Diário").is_database);
    assert!(roots(&db).iter().all(|n| n.icon.is_some()));
}

#[test]
fn o_guia_tem_conteudo_valido_texto_para_busca_e_capa() {
    let db = db();
    seed_if_first_run(db.connection()).unwrap();
    let guide_id = roots(&db)
        .into_iter()
        .find(|n| n.title == "Comece por aqui")
        .unwrap()
        .id;

    let note = service::get(db.connection(), &guide_id).unwrap();

    let blocks: Vec<Value> = serde_json::from_str(&note.content).unwrap();
    assert!(blocks.len() >= 10);
    assert_eq!(blocks[0]["type"], "heading");
    assert!(blocks.iter().any(|b| b["type"] == "checkListItem"));
    assert!(blocks.iter().all(|b| b["children"].is_array()));
    assert!(note.body.contains("Guia rápido"));
    assert!(note.body.contains("Primeiros passos"));
    assert_eq!(note.cover.as_deref(), Some("color:#d8cbb6"));
}

#[test]
fn a_lista_de_tarefas_tem_colunas_opcoes_e_linhas_preenchidas() {
    let db = db();
    seed_if_first_run(db.connection()).unwrap();
    let id = roots(&db)
        .into_iter()
        .find(|n| n.title == "Lista de tarefas")
        .unwrap()
        .id;

    let data = database::get_database(db.connection(), &id).unwrap();

    assert_eq!(
        data.properties
            .iter()
            .map(|p| (p.name.as_str(), p.kind.as_str()))
            .collect::<Vec<_>>(),
        [
            ("Status", "select"),
            ("Prioridade", "select"),
            ("Prazo", "date")
        ]
    );
    assert_eq!(data.properties[0].options.as_array().unwrap().len(), 3);
    assert_eq!(data.rows.len(), 5);
    assert!(
        data.rows.iter().all(|row| row.cells.len() == 3),
        "toda linha vem preenchida"
    );
}

#[test]
fn os_prazos_sao_datas_validas_a_partir_de_hoje_e_em_ordem() {
    let db = db();
    seed_if_first_run(db.connection()).unwrap();
    let id = roots(&db)
        .into_iter()
        .find(|n| n.title == "Lista de tarefas")
        .unwrap()
        .id;
    let data = database::get_database(db.connection(), &id).unwrap();
    let prazo = &data.properties[2].id;

    let dates: Vec<String> = data
        .rows
        .iter()
        .map(|r| r.cells[prazo].as_str().unwrap().to_string())
        .collect();

    let today: String = db
        .connection()
        .query_row("SELECT date('now')", [], |r| r.get(0))
        .unwrap();
    assert_eq!(dates[0], today, "a primeira vence hoje");
    let mut sorted = dates.clone();
    sorted.sort();
    assert_eq!(dates, sorted, "os prazos crescem");
    assert!(dates.iter().all(|d| d.len() == 10));
}

#[test]
fn as_leituras_tem_autor_status_e_nota_opcional() {
    let db = db();
    seed_if_first_run(db.connection()).unwrap();
    let id = roots(&db)
        .into_iter()
        .find(|n| n.title == "Leituras")
        .unwrap()
        .id;

    let data = database::get_database(db.connection(), &id).unwrap();

    assert_eq!(data.rows.len(), 3);
    let nota = &data.properties[2].id;
    assert_eq!(
        data.rows
            .iter()
            .filter(|r| r.cells.contains_key(nota))
            .count(),
        1
    );
    assert!(
        data.rows
            .iter()
            .all(|r| r.cells.contains_key(&data.properties[0].id))
    );
}

#[test]
fn quem_ja_tem_paginas_nao_ganha_exemplos_mas_o_marcador_e_gravado() {
    let db = db();
    service::create(
        db.connection(),
        NewNote {
            title: "Minha".into(),
            body: String::new(),
            parent_id: None,
        },
    )
    .unwrap();

    assert!(!seed_if_first_run(db.connection()).unwrap());

    assert_eq!(titles(&db), ["Minha"]);
    // Mesmo depois de apagar tudo, os exemplos não aparecem.
    let id = roots(&db)[0].id.clone();
    service::delete(db.connection(), &id).unwrap();
    service::empty_trash(db.connection()).unwrap();
    assert!(!seed_if_first_run(db.connection()).unwrap());
    assert!(roots(&db).is_empty());
}

#[test]
fn pagina_so_na_lixeira_conta_como_existente() {
    let db = db();
    let note = service::create(
        db.connection(),
        NewNote {
            title: "Velha".into(),
            body: String::new(),
            parent_id: None,
        },
    )
    .unwrap();
    service::delete(db.connection(), &note.id).unwrap();

    assert!(!seed_if_first_run(db.connection()).unwrap());
}

#[test]
fn apagar_os_exemplos_nao_os_traz_de_volta() {
    let db = db();
    seed_if_first_run(db.connection()).unwrap();
    for note in roots(&db) {
        service::delete(db.connection(), &note.id).unwrap();
    }
    service::empty_trash(db.connection()).unwrap();

    assert!(!seed_if_first_run(db.connection()).unwrap());

    assert!(roots(&db).is_empty());
}

#[test]
fn create_samples_direto_cria_de_novo_sem_conferir() {
    let db = db();
    create_samples(db.connection()).unwrap();
    create_samples(db.connection()).unwrap();

    assert_eq!(roots(&db).len(), 8);
}
