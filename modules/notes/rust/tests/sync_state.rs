//! Testes do estado de sincronização mantido pelos gatilhos.

use tramion_infra_sqlite::Database;
use tramion_notes::MIGRATIONS;
use tramion_notes::model::NewNote;
use tramion_notes::service;

fn db() -> Database {
    Database::open_in_memory(&[MIGRATIONS]).expect("as migrações reais devem aplicar")
}

fn state(db: &Database, kind: &str, id: &str) -> Option<(i64, String, i64)> {
    db.connection()
        .query_row(
            "SELECT updated_at, device, deleted FROM notes_sync_state WHERE kind = ?1 AND id = ?2",
            [kind, id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok()
}

fn new_note(db: &Database, title: &str) -> String {
    service::create(
        db.connection(),
        NewNote {
            title: title.into(),
            body: String::new(),
            parent_id: None,
        },
    )
    .unwrap()
    .id
}

fn exec(db: &Database, sql: &str) {
    db.connection().execute_batch(sql).unwrap();
}

#[test]
fn criar_e_editar_uma_pagina_registra_o_estado_com_o_aparelho() {
    let db = db();
    exec(
        &db,
        "INSERT INTO notes_meta (key, value) VALUES ('device_id', 'celular')",
    );

    let id = new_note(&db, "A");

    let (at, device, deleted) = state(&db, "note", &id).expect("estado criado");
    assert!(at > 0);
    assert_eq!(device, "celular");
    assert_eq!(deleted, 0);
}

#[test]
fn sem_id_de_aparelho_usa_local() {
    let db = db();
    let id = new_note(&db, "A");

    assert_eq!(state(&db, "note", &id).unwrap().1, "local");
}

#[test]
fn apagar_de_vez_vira_lapide_e_o_apagamento_em_cascata_tambem() {
    let db = db();
    let id = new_note(&db, "Base");
    exec(
        &db,
        &format!(
            "INSERT INTO notes_database (note_id) VALUES ('{id}');
             INSERT INTO notes_property (id, database_id, name, kind, position) VALUES ('p1', '{id}', 'Obs', 'text', 0);
             INSERT INTO notes_cell (note_id, property_id, value) VALUES ('{id}', 'p1', '\"x\"');"
        ),
    );
    assert_eq!(state(&db, "cell", &format!("{id}:p1")).unwrap().2, 0);

    exec(&db, &format!("DELETE FROM notes_note WHERE id = '{id}'"));

    assert_eq!(state(&db, "note", &id).unwrap().2, 1);
    assert_eq!(
        state(&db, "property", "p1").unwrap().2,
        1,
        "cascata gera lápide"
    );
    assert_eq!(state(&db, "cell", &format!("{id}:p1")).unwrap().2, 1);
}

#[test]
fn mudancas_aplicadas_de_outro_aparelho_nao_sao_marcadas_como_locais() {
    let db = db();
    exec(
        &db,
        "INSERT INTO notes_meta (key, value) VALUES ('sync_applying', '1')",
    );

    exec(
        &db,
        "INSERT INTO notes_note (id, title) VALUES ('remota', 'Veio de fora')",
    );

    assert!(state(&db, "note", "remota").is_none());
    exec(
        &db,
        "UPDATE notes_meta SET value = '0' WHERE key = 'sync_applying'",
    );
    exec(
        &db,
        "UPDATE notes_note SET title = 'Editada aqui' WHERE id = 'remota'",
    );
    assert!(
        state(&db, "note", "remota").is_some(),
        "depois de desligar, volta a registrar"
    );
}

#[test]
fn modelos_do_usuario_e_visoes_tambem_registram() {
    let db = db();
    let id = new_note(&db, "Base");
    exec(
        &db,
        &format!(
            "INSERT INTO notes_database (note_id) VALUES ('{id}');
             INSERT INTO notes_view (id, database_id, name, config, position) VALUES ('v1', '{id}', 'T', '{{}}', 9);
             INSERT INTO notes_user_template (id, name, icon, body, content) VALUES ('t1', 'M', '📄', '', '[]');"
        ),
    );

    assert!(state(&db, "view", "v1").is_some());
    assert!(state(&db, "template", "t1").is_some());
}
