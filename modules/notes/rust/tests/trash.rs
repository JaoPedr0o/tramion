//! Testes de esvaziar a lixeira.

use tramion_infra_sqlite::Database;
use tramion_notes::MIGRATIONS;
use tramion_notes::database;
use tramion_notes::model::NewNote;
use tramion_notes::service;

fn db() -> Database {
    Database::open_in_memory(&[MIGRATIONS]).expect("as migrações reais devem aplicar")
}

fn page(db: &Database, title: &str, parent: Option<&str>) -> String {
    service::create(
        db.connection(),
        NewNote {
            title: title.into(),
            body: String::new(),
            parent_id: parent.map(str::to_string),
        },
    )
    .unwrap()
    .id
}

fn sorted(mut ids: Vec<String>) -> Vec<String> {
    ids.sort();
    ids
}

#[test]
fn lixeira_vazia_devolve_lista_vazia_e_nao_mexe_em_nada() {
    let db = db();
    let ativa = page(&db, "Ativa", None);

    assert!(service::empty_trash(db.connection()).unwrap().is_empty());

    assert_eq!(service::list(db.connection()).unwrap()[0].id, ativa);
}

#[test]
fn apaga_tudo_que_esta_na_lixeira_e_so_isso() {
    let db = db();
    let ativa = page(&db, "Ativa", None);
    let filha_ativa = page(&db, "Filha ativa", Some(&ativa));
    let excluida = page(&db, "Excluída", None);
    let neta = page(&db, "Neta", Some(&excluida));
    let outra = page(&db, "Outra", None);
    service::delete(db.connection(), &excluida).unwrap();
    service::delete(db.connection(), &outra).unwrap();

    let purged = service::empty_trash(db.connection()).unwrap();

    assert_eq!(sorted(purged), sorted(vec![excluida.clone(), neta, outra]));
    let remaining: Vec<String> = service::list(db.connection())
        .unwrap()
        .into_iter()
        .map(|n| n.id)
        .collect();
    assert_eq!(sorted(remaining), sorted(vec![ativa, filha_ativa]));
    assert!(service::list_trash(db.connection()).unwrap().is_empty());
    assert_eq!(
        service::get(db.connection(), &excluida).unwrap_err().code(),
        "notes.not-found"
    );
}

#[test]
fn levar_pai_e_filhas_juntos_funciona_mesmo_com_varios_niveis() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", Some(&a));
    let c = page(&db, "C", Some(&b));
    let d = page(&db, "D", Some(&c));
    service::delete(db.connection(), &a).unwrap();

    let purged = service::empty_trash(db.connection()).unwrap();

    assert_eq!(sorted(purged), sorted(vec![a, b, c, d]));
}

#[test]
fn apagar_uma_base_da_lixeira_leva_colunas_e_celulas() {
    let db = db();
    let base = database::create_database(db.connection(), "Base", None).unwrap();
    let coluna = database::add_property(db.connection(), &base.id, "Obs", "text").unwrap();
    let linha = database::create_row(db.connection(), &base.id, "L").unwrap();
    database::set_cell(
        db.connection(),
        &linha.id,
        &coluna.id,
        &serde_json::json!("x"),
    )
    .unwrap();
    service::delete(db.connection(), &base.id).unwrap();

    let purged = service::empty_trash(db.connection()).unwrap();

    assert_eq!(purged.len(), 2);
    let count = |sql: &str| -> i64 { db.connection().query_row(sql, [], |r| r.get(0)).unwrap() };
    assert_eq!(count("SELECT COUNT(*) FROM notes_database"), 0);
    assert_eq!(count("SELECT COUNT(*) FROM notes_property"), 0);
    assert_eq!(count("SELECT COUNT(*) FROM notes_cell"), 0);
}

#[test]
fn esvaziar_duas_vezes_e_seguro() {
    let db = db();
    let a = page(&db, "A", None);
    service::delete(db.connection(), &a).unwrap();

    assert_eq!(service::empty_trash(db.connection()).unwrap(), vec![a]);
    assert!(service::empty_trash(db.connection()).unwrap().is_empty());
}
