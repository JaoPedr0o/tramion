//! Testes de duplicar página e de criar a partir de modelo.

use serde_json::{Value, json};
use tramion_infra_sqlite::Database;
use tramion_notes::MIGRATIONS;
use tramion_notes::database;
use tramion_notes::duplicate::duplicate;
use tramion_notes::model::{NewNote, Note, UpdateNote};
use tramion_notes::service;
use tramion_notes::templates::{TEMPLATES, create_from_template, list_templates};

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

fn set_content(db: &Database, note: &Note, body: &str, content: &str) {
    let current = service::get(db.connection(), &note.id).unwrap();
    service::update(
        db.connection(),
        UpdateNote {
            id: note.id.clone(),
            title: note.title.clone(),
            body: body.into(),
            content: content.into(),
            expected_updated_at: current.updated_at,
        },
    )
    .unwrap();
}

fn titles_of(db: &Database, parent: Option<&str>) -> Vec<String> {
    service::list(db.connection())
        .unwrap()
        .into_iter()
        .filter(|n| n.parent_id.as_deref() == parent)
        .map(|n| n.title)
        .collect()
}

#[test]
fn copia_titulo_texto_simbolo_e_capa_e_vai_para_o_fim_das_irmas() {
    let db = db();
    let original = page(&db, "Receita", None);
    page(&db, "Outra", None);
    set_content(&db, &original, "farinha", "[{\"type\":\"paragraph\"}]");
    service::set_appearance(
        db.connection(),
        &original.id,
        Some("🍰"),
        Some("color:#d8cbb6"),
    )
    .unwrap();
    service::set_pinned(db.connection(), &original.id, true).unwrap();

    let ids = duplicate(db.connection(), &original.id).unwrap();

    assert_eq!(ids.len(), 1);
    let copy = service::get(db.connection(), &ids[0]).unwrap();
    assert_eq!(copy.title, "Cópia de Receita");
    assert_eq!(copy.body, "farinha");
    assert_eq!(copy.content, "[{\"type\":\"paragraph\"}]");
    assert_eq!(copy.icon.as_deref(), Some("🍰"));
    assert_eq!(copy.cover.as_deref(), Some("color:#d8cbb6"));
    assert!(!copy.pinned, "a cópia não é favorita");
    assert_eq!(
        titles_of(&db, None),
        ["Receita", "Outra", "Cópia de Receita"]
    );
    assert_eq!(
        service::get(db.connection(), &original.id).unwrap().title,
        "Receita",
        "a original não muda"
    );
}

#[test]
fn copia_a_subarvore_ativa_e_deixa_de_fora_o_que_esta_na_lixeira() {
    let db = db();
    let pai = page(&db, "Pai", None);
    let filha = page(&db, "Filha", Some(&pai.id));
    page(&db, "Neta", Some(&filha.id));
    let apagada = page(&db, "Apagada", Some(&pai.id));
    service::delete(db.connection(), &apagada.id).unwrap();

    let ids = duplicate(db.connection(), &pai.id).unwrap();

    assert_eq!(ids.len(), 3, "pai, filha e neta; a apagada não");
    let copia_pai = &ids[0];
    assert_eq!(titles_of(&db, Some(copia_pai)), ["Filha"]);
    let copia_filha = service::list(db.connection())
        .unwrap()
        .into_iter()
        .find(|n| n.parent_id.as_deref() == Some(copia_pai))
        .unwrap();
    assert_eq!(titles_of(&db, Some(&copia_filha.id)), ["Neta"]);
    assert_ne!(copia_filha.id, filha.id);
}

#[test]
fn links_internos_apontam_para_as_copias_e_os_de_fora_continuam() {
    let db = db();
    let fora = page(&db, "De fora", None);
    let pai = page(&db, "Pai", None);
    let filha = page(&db, "Filha", Some(&pai.id));
    let content = json!([
        { "type": "childPage", "props": { "pageId": filha.id } },
        { "type": "paragraph", "content": [{ "type": "mention", "props": { "pageId": fora.id } }] },
    ])
    .to_string();
    set_content(&db, &pai, "", &content);

    let ids = duplicate(db.connection(), &pai.id).unwrap();

    let copy = service::get(db.connection(), &ids[0]).unwrap();
    assert!(
        !copy.content.contains(&filha.id),
        "o link da subpágina foi reapontado"
    );
    assert!(
        copy.content.contains(&ids[1]),
        "agora aponta para a cópia da filha"
    );
    assert!(
        copy.content.contains(&fora.id),
        "a menção a uma página de fora é mantida"
    );
    assert!(
        serde_json::from_str::<Value>(&copy.content)
            .unwrap()
            .is_array()
    );
}

#[test]
fn base_copia_colunas_visoes_linhas_e_celulas_com_ids_novos() {
    let db = db();
    let base = database::create_database(db.connection(), "Tarefas", None).unwrap();
    let status = database::add_property(db.connection(), &base.id, "Status", "select").unwrap();
    database::update_property(
        db.connection(),
        &status.id,
        None,
        Some(&json!([{ "id": "a", "name": "A fazer", "color": "gray" }])),
    )
    .unwrap();
    database::add_view(
        db.connection(),
        &base.id,
        "Quadro",
        &json!({ "mode": "board", "groupBy": status.id, "filters": [], "sort": null }),
    )
    .unwrap();
    let linha = database::create_row(db.connection(), &base.id, "Tarefa 1").unwrap();
    database::set_cell(db.connection(), &linha.id, &status.id, &json!("a")).unwrap();

    let ids = duplicate(db.connection(), &base.id).unwrap();

    let copy = database::get_database(db.connection(), &ids[0]).unwrap();
    assert_eq!(copy.title, "Cópia de Tarefas");
    assert_eq!(copy.properties.len(), 1);
    assert_ne!(copy.properties[0].id, status.id, "a coluna tem id novo");
    assert_eq!(copy.rows.len(), 1);
    assert_ne!(copy.rows[0].id, linha.id);
    assert_eq!(copy.rows[0].cells[&copy.properties[0].id], json!("a"));
    assert_eq!(copy.views.len(), 2);
    let board = copy.views.iter().find(|v| v.name == "Quadro").unwrap();
    assert_eq!(
        board.config["groupBy"],
        json!(copy.properties[0].id),
        "a visão usa a coluna da cópia"
    );

    let original = database::get_database(db.connection(), &base.id).unwrap();
    assert_eq!(
        original.rows[0].cells[&status.id],
        json!("a"),
        "a original não mudou"
    );
}

#[test]
fn titulo_da_copia_respeita_o_limite() {
    let db = db();
    let longa = page(&db, &"x".repeat(200), None);

    let ids = duplicate(db.connection(), &longa.id).unwrap();

    assert_eq!(
        service::get(db.connection(), &ids[0])
            .unwrap()
            .title
            .chars()
            .count(),
        200
    );
}

#[test]
fn nao_duplica_o_que_nao_existe_nem_o_que_esta_na_lixeira() {
    let db = db();
    let nota = page(&db, "N", None);
    service::delete(db.connection(), &nota.id).unwrap();

    assert_eq!(
        duplicate(db.connection(), "nao-existe").unwrap_err().code(),
        "notes.not-found"
    );
    assert_eq!(
        duplicate(db.connection(), &nota.id).unwrap_err().code(),
        "notes.in-trash"
    );
}

#[test]
fn duplicar_uma_subpagina_deixa_a_copia_ao_lado_dela() {
    let db = db();
    let pai = page(&db, "Pai", None);
    let filha = page(&db, "Filha", Some(&pai.id));

    duplicate(db.connection(), &filha.id).unwrap();

    assert_eq!(titles_of(&db, Some(&pai.id)), ["Filha", "Cópia de Filha"]);
}

#[test]
fn ha_cinco_modelos_com_nome_e_simbolo() {
    let templates = list_templates();

    assert_eq!(templates.len(), 5);
    assert!(
        templates
            .iter()
            .all(|t| !t.name.is_empty() && !t.icon.is_empty() && !t.description.is_empty())
    );
    let mut ids: Vec<_> = templates.iter().map(|t| t.id).collect();
    ids.sort();
    ids.dedup();
    assert_eq!(ids.len(), 5, "ids únicos");
}

#[test]
fn cada_modelo_cria_uma_pagina_valida_na_raiz_ou_dentro_de_outra() {
    let db = db();
    let pai = page(&db, "Pai", None);

    for template in TEMPLATES.iter().filter(|t| t.id != "tasks") {
        let note = create_from_template(db.connection(), template.id, None).unwrap();
        assert_eq!(note.title, template.name);
        assert_eq!(note.icon.as_deref(), Some(template.icon));
        let blocks: Vec<Value> = serde_json::from_str(&note.content).unwrap();
        assert!(blocks.len() >= 4, "{} tem esqueleto", template.id);
        assert!(note.parent_id.is_none());

        let inside = create_from_template(db.connection(), template.id, Some(&pai.id)).unwrap();
        assert_eq!(inside.parent_id.as_deref(), Some(pai.id.as_str()));
    }
}

#[test]
fn modelo_de_tarefas_cria_uma_base_com_colunas_e_visao() {
    let db = db();

    let note = create_from_template(db.connection(), "tasks", None).unwrap();

    let data = database::get_database(db.connection(), &note.id).unwrap();
    assert_eq!(
        data.properties
            .iter()
            .map(|p| p.name.as_str())
            .collect::<Vec<_>>(),
        ["Status", "Prioridade", "Prazo"]
    );
    assert_eq!(data.properties[0].options.as_array().unwrap().len(), 3);
    assert_eq!(data.views.len(), 1);
    assert!(data.rows.is_empty());
}

#[test]
fn modelo_desconhecido_ou_pai_invalido_falham_sem_deixar_pagina() {
    let db = db();

    assert_eq!(
        create_from_template(db.connection(), "nao-existe", None)
            .unwrap_err()
            .code(),
        "notes.not-found"
    );
    assert_eq!(
        create_from_template(db.connection(), "meeting", Some("nao-existe"))
            .unwrap_err()
            .code(),
        "notes.parent-not-found"
    );
    assert!(service::list(db.connection()).unwrap().is_empty());
}
