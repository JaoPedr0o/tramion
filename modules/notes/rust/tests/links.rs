//! Testes de backlinks e do grafo de conexões.

use serde_json::json;
use tramion_infra_sqlite::Database;
use tramion_notes::MIGRATIONS;
use tramion_notes::database;
use tramion_notes::links::{GraphEdge, MAX_GRAPH_NODES, backlinks, extract_references, graph};
use tramion_notes::model::{NewNote, Note, UpdateNote};
use tramion_notes::service;

fn db() -> Database {
    Database::open_in_memory(&[MIGRATIONS]).expect("as migrações reais devem aplicar")
}

fn page(db: &Database, title: &str, parent: Option<&str>) -> Note {
    service::create(
        db.connection(),
        NewNote {
            title: title.into(),
            body: String::new(),
            parent_id: parent.map(str::to_string),
        },
    )
    .unwrap()
}

fn write(db: &Database, note: &Note, content: serde_json::Value) {
    let current = service::get(db.connection(), &note.id).unwrap();
    service::update(
        db.connection(),
        UpdateNote {
            id: note.id.clone(),
            title: note.title.clone(),
            body: String::new(),
            content: content.to_string(),
            expected_updated_at: current.updated_at,
        },
    )
    .unwrap();
}

fn mention(id: &str) -> serde_json::Value {
    json!({ "type": "paragraph", "content": [{ "type": "mention", "props": { "pageId": id } }] })
}

fn child(id: &str) -> serde_json::Value {
    json!({ "type": "childPage", "props": { "pageId": id } })
}

fn titles(refs: &[tramion_notes::links::PageRef]) -> Vec<&str> {
    refs.iter().map(|r| r.title.as_str()).collect()
}

#[test]
fn extrai_mencoes_e_subpaginas_sem_repetir_e_ignora_lixo() {
    let content = json!([
        child("a"),
        mention("b"),
        mention("a"),
        { "type": "paragraph", "children": [mention("c")] },
        { "type": "paragraph", "props": { "pageId": "nao-conta" } },
        { "type": "image", "props": { "url": "x" } },
    ])
    .to_string();

    assert_eq!(extract_references(&content), ["a", "b", "c"]);
    assert!(extract_references("não é json").is_empty());
    assert!(extract_references("{}").is_empty());
    assert!(extract_references("[]").is_empty());
}

#[test]
fn backlinks_listam_quem_menciona_em_ordem_alfabetica_sem_a_propria() {
    let db = db();
    let alvo = page(&db, "Alvo", None);
    let b = page(&db, "beta", None);
    let a = page(&db, "Alfa", None);
    page(&db, "Sem link", None);
    write(&db, &b, json!([mention(&alvo.id)]));
    write(&db, &a, json!([child(&alvo.id)]));
    write(&db, &alvo, json!([mention(&alvo.id)]));

    let refs = backlinks(db.connection(), &alvo.id).unwrap();

    assert_eq!(
        titles(&refs),
        ["Alfa", "beta"],
        "ordem alfabética sem diferenciar maiúscula"
    );
    assert!(!refs.iter().any(|r| r.id == alvo.id));
}

#[test]
fn backlinks_ignoram_a_lixeira_e_voltam_ao_restaurar() {
    let db = db();
    let alvo = page(&db, "Alvo", None);
    let outra = page(&db, "Outra", None);
    write(&db, &outra, json!([mention(&alvo.id)]));

    service::delete(db.connection(), &outra.id).unwrap();
    assert!(backlinks(db.connection(), &alvo.id).unwrap().is_empty());

    service::restore(db.connection(), &outra.id).unwrap();
    assert_eq!(
        titles(&backlinks(db.connection(), &alvo.id).unwrap()),
        ["Outra"]
    );
}

#[test]
fn texto_que_so_contem_o_id_nao_conta_como_link() {
    let db = db();
    let alvo = page(&db, "Alvo", None);
    let esperta = page(&db, "Esperta", None);
    write(
        &db,
        &esperta,
        json!([{ "type": "paragraph", "content": [{ "type": "text", "text": alvo.id, "styles": {} }] }]),
    );

    assert!(backlinks(db.connection(), &alvo.id).unwrap().is_empty());
}

#[test]
fn backlink_marca_bases_de_dados() {
    let db = db();
    let alvo = page(&db, "Alvo", None);
    let base = database::create_database(db.connection(), "Base", None).unwrap();
    write(&db, &base, json!([mention(&alvo.id)]));

    let refs = backlinks(db.connection(), &alvo.id).unwrap();

    assert_eq!(refs.len(), 1);
    assert!(refs[0].is_database);
}

#[test]
fn grafo_tem_hierarquia_como_child_e_mencoes_como_link_sem_duplicar() {
    let db = db();
    let pai = page(&db, "Pai", None);
    let filha = page(&db, "Filha", Some(&pai.id));
    let outra = page(&db, "Outra", None);
    write(&db, &pai, json!([child(&filha.id), mention(&outra.id)]));
    write(
        &db,
        &outra,
        json!([mention(&filha.id), mention(&outra.id), mention("sumiu")]),
    );

    let g = graph(db.connection()).unwrap();

    let mut edges = g.edges.clone();
    edges.sort_by(|a, b| (a.kind, &a.from, &a.to).cmp(&(b.kind, &b.from, &b.to)));
    let mut expected = vec![
        GraphEdge {
            from: pai.id.clone(),
            to: filha.id.clone(),
            kind: "child",
        },
        GraphEdge {
            from: pai.id.clone(),
            to: outra.id.clone(),
            kind: "link",
        },
        GraphEdge {
            from: outra.id.clone(),
            to: filha.id.clone(),
            kind: "link",
        },
    ];
    expected.sort_by(|a, b| (a.kind, &a.from, &a.to).cmp(&(b.kind, &b.from, &b.to)));
    assert_eq!(
        edges, expected,
        "subpágina no texto do pai não vira 2ª ligação; auto-menção e página inexistente somem"
    );
    assert_eq!(g.nodes.len(), 3);
}

#[test]
fn grafo_deixa_de_fora_a_lixeira_e_as_linhas_das_bases() {
    let db = db();
    let base = database::create_database(db.connection(), "Base", None).unwrap();
    let linha = database::create_row(db.connection(), &base.id, "Linha").unwrap();
    let apagada = page(&db, "Apagada", None);
    let viva = page(&db, "Viva", None);
    write(
        &db,
        &viva,
        json!([mention(&apagada.id), mention(&linha.id)]),
    );
    service::delete(db.connection(), &apagada.id).unwrap();

    let g = graph(db.connection()).unwrap();

    let ids: Vec<&str> = g.nodes.iter().map(|n| n.id.as_str()).collect();
    assert!(ids.contains(&base.id.as_str()) && ids.contains(&viva.id.as_str()));
    assert!(
        !ids.contains(&linha.id.as_str()),
        "linha de base fica de fora"
    );
    assert!(!ids.contains(&apagada.id.as_str()), "lixeira fica de fora");
    assert!(g.edges.is_empty(), "ligações para quem ficou de fora somem");
}

#[test]
fn grafo_limita_o_numero_de_paginas_as_mais_recentes() {
    let db = db();
    for i in 0..(MAX_GRAPH_NODES + 20) {
        page(&db, &format!("P{i}"), None);
    }

    assert_eq!(graph(db.connection()).unwrap().nodes.len(), MAX_GRAPH_NODES);
}

#[test]
fn grafo_vazio() {
    let db = db();
    let g = graph(db.connection()).unwrap();

    assert!(g.nodes.is_empty() && g.edges.is_empty());
}
