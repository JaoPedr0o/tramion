//! Testes das visões salvas de uma base.

use serde_json::{Value, json};
use tramion_infra_sqlite::Database;
use tramion_notes::MIGRATIONS;
use tramion_notes::database::{self, MAX_VIEWS, validate_view_config};
use tramion_notes::error::NotesError;
use tramion_notes::model::{NewNote, Note};
use tramion_notes::service;

fn db() -> Database {
    Database::open_in_memory(&[MIGRATIONS]).expect("as migrações reais devem aplicar")
}

fn base(db: &Database) -> Note {
    database::create_database(db.connection(), "Tarefas", None).unwrap()
}

fn code<T: std::fmt::Debug>(result: Result<T, NotesError>) -> &'static str {
    result.expect_err("era para falhar").code()
}

fn board() -> Value {
    json!({ "mode": "board", "groupBy": "p1", "filters": [], "sort": null })
}

#[test]
fn toda_base_nova_nasce_com_a_visao_tabela() {
    let db = db();
    let base = base(&db);

    let data = database::get_database(db.connection(), &base.id).unwrap();

    assert_eq!(data.views.len(), 1);
    assert_eq!(data.views[0].name, "Tabela");
    assert_eq!(data.views[0].config["mode"], "table");
    assert_eq!(data.views[0].position, 0);
}

#[test]
fn migracao_da_visao_inicial_cobre_bases_que_ja_existiam() {
    // Simula uma base criada ANTES da migração 9: aplica as migrações até a 8, cria a base na mão e aplica a 9.
    let db = Database::open_in_memory(&[MIGRATIONS]).unwrap();
    let conn = db.connection();
    conn.execute_batch(
        "DELETE FROM notes_view;
         INSERT INTO notes_note (id, title, body, parent_id, position) VALUES ('antiga', 'Antiga', '', NULL, 0);
         INSERT INTO notes_database (note_id) VALUES ('antiga');",
    )
    .unwrap();
    let sql = include_str!("../migrations/0009_database_views.sql");
    let backfill = sql.split("INSERT INTO notes_view").nth(1).unwrap();
    conn.execute_batch(&format!("INSERT INTO notes_view{backfill}"))
        .unwrap();

    let data = database::get_database(conn, "antiga").unwrap();

    assert_eq!(data.views.len(), 1);
    assert_eq!(data.views[0].name, "Tabela");
}

#[test]
fn adiciona_visoes_no_fim_e_limpa_a_configuracao() {
    let db = db();
    let base = base(&db);

    let view = database::add_view(
        db.connection(),
        &base.id,
        "  Por status ",
        &json!({ "mode": "board", "groupBy": "p1", "lixo": "x", "filters": [], "sort": null }),
    )
    .unwrap();

    assert_eq!(view.name, "Por status");
    assert_eq!(view.position, 1);
    assert_eq!(view.config["mode"], "board");
    assert_eq!(view.config["groupBy"], "p1");
    assert!(
        view.config.get("lixo").is_none(),
        "campos desconhecidos não são guardados"
    );
    assert_eq!(view.config["dateProperty"], Value::Null);
}

#[test]
fn nome_da_visao_e_validado() {
    let db = db();
    let base = base(&db);

    assert_eq!(
        code(database::add_view(db.connection(), &base.id, " ", &board())),
        "notes.view-invalid"
    );
    assert_eq!(
        code(database::add_view(
            db.connection(),
            &base.id,
            &"x".repeat(61),
            &board()
        )),
        "notes.view-invalid"
    );
}

#[test]
fn configuracao_invalida_e_recusada() {
    let bad = [
        json!("texto"),
        json!([]),
        json!({}),
        json!({ "mode": "mapa" }),
        json!({ "mode": 5 }),
        json!({ "mode": "table", "filters": "x" }),
        json!({ "mode": "table", "filters": [{ "property": "a", "operator": "contains" }] }),
        json!({ "mode": "table", "filters": [{ "property": 1, "operator": "x", "value": "y" }] }),
        json!({ "mode": "table", "sort": { "property": "a", "direction": "up" } }),
        json!({ "mode": "table", "sort": { "direction": "asc" } }),
        json!({ "mode": "calendar", "scale": "year" }),
        json!({ "mode": "board", "groupBy": 7 }),
        json!({ "mode": "table", "groupBy": "x\u{0}y" }),
    ];
    for config in bad {
        assert!(
            validate_view_config(&config).is_err(),
            "deveria recusar: {config}"
        );
    }
}

#[test]
fn configuracao_valida_completa_e_aceita() {
    let config = json!({
        "mode": "calendar",
        "filters": [{ "property": "title", "operator": "contains", "value": "pão" }],
        "sort": { "property": "p2", "direction": "desc" },
        "dateProperty": "p3",
        "scale": "week"
    });

    let clean = validate_view_config(&config).unwrap();

    assert_eq!(clean["scale"], "week");
    assert_eq!(clean["filters"][0]["value"], "pão");
    assert_eq!(clean["sort"]["direction"], "desc");
    assert_eq!(clean["dateProperty"], "p3");
}

#[test]
fn limite_de_filtros_e_de_tamanho() {
    let many: Vec<Value> = (0..21)
        .map(|_| json!({ "property": "a", "operator": "contains", "value": "x" }))
        .collect();
    assert!(validate_view_config(&json!({ "mode": "table", "filters": many })).is_err());

    let long = "x".repeat(501);
    assert!(
        validate_view_config(&json!({
            "mode": "table",
            "filters": [{ "property": "a", "operator": "contains", "value": long }]
        }))
        .is_err()
    );
}

#[test]
fn limite_de_visoes_por_base() {
    let db = db();
    let base = base(&db);
    for i in 1..MAX_VIEWS {
        database::add_view(db.connection(), &base.id, &format!("V{i}"), &board()).unwrap();
    }

    assert_eq!(
        code(database::add_view(
            db.connection(),
            &base.id,
            "demais",
            &board()
        )),
        "notes.limit-reached"
    );
}

#[test]
fn atualiza_nome_e_configuracao_separadamente() {
    let db = db();
    let base = base(&db);
    let view = database::add_view(db.connection(), &base.id, "A", &board()).unwrap();

    let renamed = database::update_view(db.connection(), &view.id, Some(" Nova "), None).unwrap();
    assert_eq!(renamed.name, "Nova");
    assert_eq!(renamed.config["mode"], "board");

    let changed = database::update_view(
        db.connection(),
        &view.id,
        None,
        Some(&json!({ "mode": "list", "filters": [], "sort": null })),
    )
    .unwrap();
    assert_eq!(changed.name, "Nova");
    assert_eq!(changed.config["mode"], "list");

    assert_eq!(
        code(database::update_view(
            db.connection(),
            &view.id,
            Some(""),
            None
        )),
        "notes.view-invalid"
    );
    assert_eq!(
        code(database::update_view(
            db.connection(),
            &view.id,
            None,
            Some(&json!({ "mode": "x" }))
        )),
        "notes.view-invalid"
    );
    assert_eq!(
        code(database::update_view(
            db.connection(),
            "nao-existe",
            Some("x"),
            None
        )),
        "notes.view-not-found"
    );
}

#[test]
fn apaga_visao_mas_nunca_a_ultima() {
    let db = db();
    let base = base(&db);
    let extra = database::add_view(db.connection(), &base.id, "Extra", &board()).unwrap();
    let first = database::get_database(db.connection(), &base.id)
        .unwrap()
        .views[0]
        .id
        .clone();

    database::delete_view(db.connection(), &extra.id).unwrap();
    assert_eq!(
        database::get_database(db.connection(), &base.id)
            .unwrap()
            .views
            .len(),
        1
    );

    assert_eq!(
        code(database::delete_view(db.connection(), &first)),
        "notes.view-invalid"
    );
    assert_eq!(
        code(database::delete_view(db.connection(), &extra.id)),
        "notes.view-not-found"
    );
}

#[test]
fn pagina_comum_ou_na_lixeira_nao_aceita_visoes() {
    let db = db();
    let page = service::create(
        db.connection(),
        NewNote {
            title: "P".into(),
            body: String::new(),
            parent_id: None,
        },
    )
    .unwrap();
    assert_eq!(
        code(database::add_view(db.connection(), &page.id, "V", &board())),
        "notes.not-database"
    );

    let base = base(&db);
    let view = database::add_view(db.connection(), &base.id, "V", &board()).unwrap();
    service::delete(db.connection(), &base.id).unwrap();
    assert_eq!(
        code(database::add_view(db.connection(), &base.id, "W", &board())),
        "notes.in-trash"
    );
    assert_eq!(
        code(database::update_view(
            db.connection(),
            &view.id,
            Some("X"),
            None
        )),
        "notes.in-trash"
    );
}

#[test]
fn apagar_a_base_de_vez_leva_as_visoes() {
    let db = db();
    let base = base(&db);
    database::add_view(db.connection(), &base.id, "V", &board()).unwrap();
    service::delete(db.connection(), &base.id).unwrap();

    service::purge(db.connection(), &base.id).unwrap();

    let count: i64 = db
        .connection()
        .query_row("SELECT COUNT(*) FROM notes_view", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 0);
}
