//! Testes das bases de dados: colunas, linhas, células e as regras de cada tipo.

use aesthetic_infra_sqlite::Database;
use aesthetic_notes::MIGRATIONS;
use aesthetic_notes::database::{self, MAX_PROPERTIES};
use aesthetic_notes::error::NotesError;
use aesthetic_notes::model::{NewNote, Note};
use aesthetic_notes::service;
use serde_json::{Value, json};

fn db() -> Database {
    Database::open_in_memory(&[MIGRATIONS]).expect("as migrações reais devem aplicar")
}

fn base(db: &Database) -> Note {
    database::create_database(db.connection(), "Tarefas", None).unwrap()
}

fn property(db: &Database, base: &Note, name: &str, kind: &str) -> String {
    database::add_property(db.connection(), &base.id, name, kind)
        .unwrap()
        .id
}

fn row(db: &Database, base: &Note, title: &str) -> String {
    database::create_row(db.connection(), &base.id, title)
        .unwrap()
        .id
}

fn cell(db: &Database, base: &Note, row_id: &str, property_id: &str) -> Option<Value> {
    let data = database::get_database(db.connection(), &base.id).unwrap();
    data.rows
        .into_iter()
        .find(|r| r.id == row_id)
        .and_then(|r| r.cells.get(property_id).cloned())
}

fn code<T: std::fmt::Debug>(result: Result<T, NotesError>) -> &'static str {
    result.expect_err("era para falhar").code()
}

fn options() -> Value {
    json!([
        { "id": "a", "name": "A fazer", "color": "gray" },
        { "id": "b", "name": "Feito", "color": "green" }
    ])
}

#[test]
fn cria_a_base_marcada_e_ela_aparece_como_base_na_listagem() {
    let db = db();
    let base = base(&db);

    let list = service::list(db.connection()).unwrap();

    assert!(list.iter().find(|n| n.id == base.id).unwrap().is_database);
}

#[test]
fn pagina_comum_nao_e_base() {
    let db = db();
    let page = service::create(
        db.connection(),
        NewNote {
            title: "Comum".into(),
            body: String::new(),
            parent_id: None,
        },
    )
    .unwrap();

    assert!(!service::list(db.connection()).unwrap()[0].is_database);
    assert_eq!(
        code(database::get_database(db.connection(), &page.id)),
        "notes.not-database"
    );
    assert_eq!(
        code(database::add_property(
            db.connection(),
            &page.id,
            "X",
            "text"
        )),
        "notes.not-database"
    );
    assert_eq!(
        code(database::create_row(db.connection(), &page.id, "L")),
        "notes.not-database"
    );
}

#[test]
fn base_exige_titulo_e_pai_ativo() {
    let db = db();

    assert_eq!(
        code(database::create_database(db.connection(), "  ", None)),
        "notes.title-empty"
    );
    assert_eq!(
        code(database::create_database(
            db.connection(),
            "A",
            Some("nao-existe")
        )),
        "notes.parent-not-found"
    );
}

#[test]
fn falha_ao_criar_nao_deixa_pagina_orfa() {
    let db = db();

    let _ = database::create_database(db.connection(), "A", Some("nao-existe"));

    assert!(service::list(db.connection()).unwrap().is_empty());
}

#[test]
fn colunas_entram_no_fim_e_o_nome_e_validado() {
    let db = db();
    let base = base(&db);
    property(&db, &base, "Nome", "text");
    property(&db, &base, "Prazo", "date");

    let data = database::get_database(db.connection(), &base.id).unwrap();

    assert_eq!(
        data.properties
            .iter()
            .map(|p| p.name.as_str())
            .collect::<Vec<_>>(),
        ["Nome", "Prazo"]
    );
    assert_eq!(data.properties[1].position, 1);
    assert_eq!(data.properties[1].kind, "date");
    assert_eq!(
        code(database::add_property(
            db.connection(),
            &base.id,
            " ",
            "text"
        )),
        "notes.property-invalid"
    );
    assert_eq!(
        code(database::add_property(
            db.connection(),
            &base.id,
            &"x".repeat(101),
            "text"
        )),
        "notes.property-invalid"
    );
    assert_eq!(
        code(database::add_property(
            db.connection(),
            &base.id,
            "X",
            "formula"
        )),
        "notes.property-invalid"
    );
}

#[test]
fn limite_de_colunas() {
    let db = db();
    let base = base(&db);
    for i in 0..MAX_PROPERTIES {
        property(&db, &base, &format!("c{i}"), "text");
    }

    assert_eq!(
        code(database::add_property(
            db.connection(),
            &base.id,
            "demais",
            "text"
        )),
        "notes.limit-reached"
    );
}

#[test]
fn linhas_sao_subpaginas_e_comecam_sem_celulas() {
    let db = db();
    let base = base(&db);
    let r1 = row(&db, &base, "Primeira");
    let r2 = row(&db, &base, "Segunda");

    let data = database::get_database(db.connection(), &base.id).unwrap();

    assert_eq!(data.title, "Tarefas");
    assert_eq!(
        data.rows.iter().map(|r| r.id.clone()).collect::<Vec<_>>(),
        [r1.clone(), r2]
    );
    assert!(data.rows[0].cells.is_empty());
    let page = service::get(db.connection(), &r1).unwrap();
    assert_eq!(page.parent_id.as_deref(), Some(base.id.as_str()));
}

#[test]
fn texto_numero_caixa_data_e_link() {
    let db = db();
    let base = base(&db);
    let r = row(&db, &base, "L");
    let text = property(&db, &base, "Obs", "text");
    let num = property(&db, &base, "Qtd", "number");
    let check = property(&db, &base, "Ok", "checkbox");
    let date = property(&db, &base, "Prazo", "date");
    let url = property(&db, &base, "Site", "url");
    let set = |p: &str, v: Value| database::set_cell(db.connection(), &r, p, &v);

    set(&text, json!("olá")).unwrap();
    set(&num, json!(3.5)).unwrap();
    set(&check, json!(false)).unwrap();
    set(&date, json!("2024-02-29")).unwrap();
    set(&url, json!("https://exemplo.com")).unwrap();

    assert_eq!(cell(&db, &base, &r, &text), Some(json!("olá")));
    assert_eq!(cell(&db, &base, &r, &num), Some(json!(3.5)));
    assert_eq!(cell(&db, &base, &r, &check), Some(json!(false)));
    assert_eq!(cell(&db, &base, &r, &date), Some(json!("2024-02-29")));
    assert_eq!(
        cell(&db, &base, &r, &url),
        Some(json!("https://exemplo.com"))
    );
}

#[test]
fn valores_que_nao_servem_para_o_tipo_sao_recusados() {
    let db = db();
    let base = base(&db);
    let r = row(&db, &base, "L");
    let text = property(&db, &base, "T", "text");
    let num = property(&db, &base, "N", "number");
    let check = property(&db, &base, "C", "checkbox");
    let date = property(&db, &base, "D", "date");
    let url = property(&db, &base, "U", "url");
    let fail = |p: &str, v: Value| code(database::set_cell(db.connection(), &r, p, &v));

    assert_eq!(fail(&text, json!(5)), "notes.cell-invalid");
    assert_eq!(fail(&text, json!("x".repeat(2001))), "notes.cell-invalid");
    assert_eq!(fail(&num, json!("5")), "notes.cell-invalid");
    assert_eq!(fail(&check, json!("sim")), "notes.cell-invalid");
    assert_eq!(fail(&date, json!("2023-02-29")), "notes.cell-invalid");
    assert_eq!(fail(&date, json!("2024-13-01")), "notes.cell-invalid");
    assert_eq!(fail(&date, json!("2024-1-1")), "notes.cell-invalid");
    assert_eq!(fail(&date, json!("31/12/2024")), "notes.cell-invalid");
    assert_eq!(
        fail(&url, json!("javascript:alert(1)")),
        "notes.cell-invalid"
    );
    assert_eq!(fail(&url, json!("https://a b.com")), "notes.cell-invalid");
    assert_eq!(fail(&text, json!(["a"])), "notes.cell-invalid");
}

#[test]
fn datas_de_fim_de_mes_e_ano_bissexto() {
    let db = db();
    let base = base(&db);
    let r = row(&db, &base, "L");
    let date = property(&db, &base, "D", "date");
    let set = |v: &str| database::set_cell(db.connection(), &r, &date, &json!(v));

    assert!(set("2024-04-30").is_ok());
    assert!(set("2024-04-31").is_err());
    assert!(set("1900-02-29").is_err(), "1900 não foi bissexto");
    assert!(set("2000-02-29").is_ok(), "2000 foi bissexto");
    assert!(set("2024-00-10").is_err());
    assert!(set("2024-01-00").is_err());
}

#[test]
fn valor_vazio_apaga_a_celula() {
    let db = db();
    let base = base(&db);
    let r = row(&db, &base, "L");
    let text = property(&db, &base, "T", "text");
    let date = property(&db, &base, "D", "date");
    let multi = property(&db, &base, "M", "multi_select");
    database::update_property(db.connection(), &multi, None, Some(&options())).unwrap();

    for (p, filled, empty) in [
        (&text, json!("a"), json!("")),
        (&date, json!("2024-01-01"), Value::Null),
        (&multi, json!(["a"]), json!([])),
    ] {
        database::set_cell(db.connection(), &r, p, &filled).unwrap();
        assert!(cell(&db, &base, &r, p).is_some());
        database::set_cell(db.connection(), &r, p, &empty).unwrap();
        assert_eq!(cell(&db, &base, &r, p), None);
    }
}

#[test]
fn selecao_so_aceita_opcoes_da_coluna() {
    let db = db();
    let base = base(&db);
    let r = row(&db, &base, "L");
    let status = property(&db, &base, "Status", "select");
    let tags = property(&db, &base, "Tags", "multi_select");
    database::update_property(db.connection(), &status, None, Some(&options())).unwrap();
    database::update_property(db.connection(), &tags, None, Some(&options())).unwrap();

    database::set_cell(db.connection(), &r, &status, &json!("b")).unwrap();
    database::set_cell(db.connection(), &r, &tags, &json!(["a", "b"])).unwrap();

    assert_eq!(cell(&db, &base, &r, &status), Some(json!("b")));
    assert_eq!(cell(&db, &base, &r, &tags), Some(json!(["a", "b"])));
    let fail = |p: &str, v: Value| code(database::set_cell(db.connection(), &r, p, &v));
    assert_eq!(fail(&status, json!("zzz")), "notes.cell-invalid");
    assert_eq!(fail(&status, json!(["b"])), "notes.cell-invalid");
    assert_eq!(fail(&tags, json!(["a", "zzz"])), "notes.cell-invalid");
    assert_eq!(fail(&tags, json!(["a", "a"])), "notes.cell-invalid");
    assert_eq!(fail(&tags, json!("a")), "notes.cell-invalid");
}

#[test]
fn opcoes_sao_validadas_e_so_existem_em_colunas_de_selecao() {
    let db = db();
    let base = base(&db);
    let status = property(&db, &base, "Status", "select");
    let text = property(&db, &base, "T", "text");
    let update = |p: &str, v: Value| {
        code(database::update_property(
            db.connection(),
            p,
            None,
            Some(&v),
        ))
    };

    assert_eq!(update(&text, options()), "notes.property-invalid");
    assert_eq!(update(&status, json!("a")), "notes.property-invalid");
    assert_eq!(
        update(&status, json!([{ "id": "", "name": "x" }])),
        "notes.property-invalid"
    );
    assert_eq!(
        update(&status, json!([{ "id": "a", "name": " " }])),
        "notes.property-invalid"
    );
    assert_eq!(
        update(
            &status,
            json!([{ "id": "a", "name": "x" }, { "id": "a", "name": "y" }])
        ),
        "notes.property-invalid",
        "ids repetidos"
    );
    assert_eq!(
        update(&status, json!([{ "id": "a b", "name": "x" }])),
        "notes.property-invalid"
    );
    assert_eq!(
        update(
            &status,
            json!([{ "id": "a", "name": "x", "color": "javascript:1" }])
        ),
        "notes.property-invalid"
    );
    let many: Vec<Value> = (0..51)
        .map(|i| json!({ "id": format!("o{i}"), "name": "n" }))
        .collect();
    assert_eq!(
        update(&status, Value::Array(many)),
        "notes.property-invalid"
    );
}

#[test]
fn opcoes_guardam_apenas_id_nome_e_cor_e_cor_padrao() {
    let db = db();
    let base = base(&db);
    let status = property(&db, &base, "Status", "select");

    let updated = database::update_property(
        db.connection(),
        &status,
        None,
        Some(&json!([{ "id": "a", "name": "  Novo  ", "extra": "lixo" }])),
    )
    .unwrap();

    assert_eq!(
        updated.options,
        json!([{ "id": "a", "name": "Novo", "color": "default" }])
    );
}

#[test]
fn remover_uma_opcao_limpa_as_celulas_que_a_usavam() {
    let db = db();
    let base = base(&db);
    let r1 = row(&db, &base, "1");
    let r2 = row(&db, &base, "2");
    let status = property(&db, &base, "Status", "select");
    let tags = property(&db, &base, "Tags", "multi_select");
    database::update_property(db.connection(), &status, None, Some(&options())).unwrap();
    database::update_property(db.connection(), &tags, None, Some(&options())).unwrap();
    database::set_cell(db.connection(), &r1, &status, &json!("a")).unwrap();
    database::set_cell(db.connection(), &r2, &status, &json!("b")).unwrap();
    database::set_cell(db.connection(), &r1, &tags, &json!(["a", "b"])).unwrap();
    database::set_cell(db.connection(), &r2, &tags, &json!(["a"])).unwrap();

    let only_b = json!([{ "id": "b", "name": "Feito", "color": "green" }]);
    database::update_property(db.connection(), &status, None, Some(&only_b)).unwrap();
    database::update_property(db.connection(), &tags, None, Some(&only_b)).unwrap();

    assert_eq!(cell(&db, &base, &r1, &status), None);
    assert_eq!(cell(&db, &base, &r2, &status), Some(json!("b")));
    assert_eq!(cell(&db, &base, &r1, &tags), Some(json!(["b"])));
    assert_eq!(cell(&db, &base, &r2, &tags), None);
}

#[test]
fn renomear_a_coluna_mantem_o_resto() {
    let db = db();
    let base = base(&db);
    let status = property(&db, &base, "Status", "select");
    database::update_property(db.connection(), &status, None, Some(&options())).unwrap();

    let renamed =
        database::update_property(db.connection(), &status, Some("  Situação "), None).unwrap();

    assert_eq!(renamed.name, "Situação");
    assert_eq!(renamed.options, options());
    assert_eq!(
        code(database::update_property(
            db.connection(),
            &status,
            Some(""),
            None
        )),
        "notes.property-invalid"
    );
    assert_eq!(
        code(database::update_property(
            db.connection(),
            "nao-existe",
            Some("x"),
            None
        )),
        "notes.property-not-found"
    );
}

#[test]
fn apagar_a_coluna_apaga_os_valores_mas_nao_as_linhas() {
    let db = db();
    let base = base(&db);
    let r = row(&db, &base, "L");
    let text = property(&db, &base, "T", "text");
    database::set_cell(db.connection(), &r, &text, &json!("x")).unwrap();

    database::delete_property(db.connection(), &text).unwrap();

    let data = database::get_database(db.connection(), &base.id).unwrap();
    assert!(data.properties.is_empty());
    assert_eq!(data.rows.len(), 1);
    assert!(data.rows[0].cells.is_empty());
    assert_eq!(
        code(database::delete_property(db.connection(), &text)),
        "notes.property-not-found"
    );
}

#[test]
fn celula_so_vale_para_linha_da_propria_base() {
    let db = db();
    let a = base(&db);
    let b = database::create_database(db.connection(), "Outra", None).unwrap();
    let text_a = property(&db, &a, "T", "text");
    let row_b = row(&db, &b, "de B");
    let stranger = service::create(
        db.connection(),
        NewNote {
            title: "solta".into(),
            body: String::new(),
            parent_id: None,
        },
    )
    .unwrap();

    let set = |note: &str| database::set_cell(db.connection(), note, &text_a, &json!("x"));

    assert_eq!(code(set(&row_b)), "notes.cell-invalid");
    assert_eq!(code(set(&stranger.id)), "notes.cell-invalid");
    assert_eq!(code(set("nao-existe")), "notes.not-found");
    assert_eq!(
        code(database::set_cell(
            db.connection(),
            &row_b,
            "nao-existe",
            &json!("x")
        )),
        "notes.property-not-found"
    );
}

#[test]
fn linha_na_lixeira_sai_da_tela_e_nao_aceita_celulas() {
    let db = db();
    let base = base(&db);
    let r = row(&db, &base, "L");
    let text = property(&db, &base, "T", "text");
    database::set_cell(db.connection(), &r, &text, &json!("x")).unwrap();

    service::delete(db.connection(), &r).unwrap();

    assert!(
        database::get_database(db.connection(), &base.id)
            .unwrap()
            .rows
            .is_empty()
    );
    assert_eq!(
        code(database::set_cell(db.connection(), &r, &text, &json!("y"))),
        "notes.in-trash"
    );

    service::restore(db.connection(), &r).unwrap();
    assert_eq!(
        cell(&db, &base, &r, &text),
        Some(json!("x")),
        "restaurar devolve os valores"
    );
}

#[test]
fn base_na_lixeira_recusa_operacoes_e_apagar_de_vez_leva_tudo() {
    let db = db();
    let base = base(&db);
    let r = row(&db, &base, "L");
    let text = property(&db, &base, "T", "text");
    database::set_cell(db.connection(), &r, &text, &json!("x")).unwrap();

    service::delete(db.connection(), &base.id).unwrap();

    assert_eq!(
        code(database::get_database(db.connection(), &base.id)),
        "notes.in-trash"
    );
    assert_eq!(
        code(database::add_property(
            db.connection(),
            &base.id,
            "N",
            "text"
        )),
        "notes.in-trash"
    );
    assert_eq!(
        code(database::create_row(db.connection(), &base.id, "N")),
        "notes.in-trash"
    );

    service::purge(db.connection(), &base.id).unwrap();

    let count = |sql: &str| -> i64 { db.connection().query_row(sql, [], |r| r.get(0)).unwrap() };
    assert_eq!(count("SELECT COUNT(*) FROM notes_database"), 0);
    assert_eq!(count("SELECT COUNT(*) FROM notes_property"), 0);
    assert_eq!(count("SELECT COUNT(*) FROM notes_cell"), 0);
}

#[test]
fn renomear_linha_respeita_a_versao_e_valida_o_titulo() {
    let db = db();
    let base = base(&db);
    let r = database::create_row(db.connection(), &base.id, "Antes").unwrap();

    let renamed = database::rename_note(db.connection(), &r.id, "  Depois ", r.updated_at).unwrap();

    assert_eq!(renamed.title, "Depois");
    assert!(renamed.updated_at > r.updated_at);
    assert_eq!(
        code(database::rename_note(
            db.connection(),
            &r.id,
            "Outro",
            r.updated_at
        )),
        "notes.conflict",
        "versão velha"
    );
    assert_eq!(
        code(database::rename_note(
            db.connection(),
            &r.id,
            " ",
            renamed.updated_at
        )),
        "notes.title-empty"
    );
    assert_eq!(
        code(database::rename_note(db.connection(), "nao-existe", "x", 0)),
        "notes.not-found"
    );
    service::delete(db.connection(), &r.id).unwrap();
    assert_eq!(
        code(database::rename_note(
            db.connection(),
            &r.id,
            "x",
            renamed.updated_at
        )),
        "notes.in-trash"
    );
}
