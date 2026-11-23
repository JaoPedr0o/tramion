//! O ciclo completo: dois aparelhos (dois bancos) sincronizam pelo motor.

use tramion_infra_sqlite::Database;
use tramion_notes::MIGRATIONS;
use tramion_notes::model::NewNote;
use tramion_notes::service;
use tramion_notes::sync_io::{apply_records, device_id, export_records};
use tramion_sync::{Record, merge};

fn device(name: &str) -> Database {
    let db = Database::open_in_memory(&[MIGRATIONS]).unwrap();
    db.connection()
        .execute(
            "INSERT OR REPLACE INTO notes_meta (key, value) VALUES ('device_id', ?1)",
            [name],
        )
        .unwrap();
    db
}

fn note(db: &Database, title: &str) -> String {
    service::create(
        db.connection(),
        NewNote {
            title: title.into(),
            body: "corpo".into(),
            parent_id: None,
        },
    )
    .unwrap()
    .id
}

fn titles(db: &Database) -> Vec<String> {
    let mut stmt = db
        .connection()
        .prepare("SELECT title FROM notes_note ORDER BY title")
        .unwrap();
    stmt.query_map([], |r| r.get(0))
        .unwrap()
        .map(Result::unwrap)
        .collect()
}

/// Um encontro entre dois aparelhos, como a rede fará.
fn meet(base: &[Record], a: &mut Database, b: &mut Database) {
    let (ra, rb) = (
        export_records(a.connection()).unwrap(),
        export_records(b.connection()).unwrap(),
    );
    let m = merge(base, &ra, &rb);
    apply_records(a.connection_mut(), &m.for_a.apply).unwrap();
    apply_records(b.connection_mut(), &m.for_b.apply).unwrap();
}

#[test]
fn o_id_do_aparelho_e_criado_uma_vez_e_se_mantem() {
    let db = Database::open_in_memory(&[MIGRATIONS]).unwrap();

    let first = device_id(db.connection()).unwrap();

    assert_eq!(first.len(), 16);
    assert_eq!(device_id(db.connection()).unwrap(), first);
}

#[test]
fn paginas_dos_dois_aparelhos_aparecem_nos_dois() {
    let (mut a, mut b) = (device("A"), device("B"));
    note(&a, "Do computador");
    note(&b, "Do celular");

    meet(&[], &mut a, &mut b);

    assert_eq!(titles(&a), ["Do celular", "Do computador"]);
    assert_eq!(titles(&a), titles(&b));
}

#[test]
fn sincronizar_nao_re_marca_como_edicao_local_e_e_idempotente() {
    let (mut a, mut b) = (device("A"), device("B"));
    note(&a, "X");
    meet(&[], &mut a, &mut b);
    let base = export_records(a.connection()).unwrap();

    // o registro que chegou em B continua com a origem A
    let on_b = export_records(b.connection()).unwrap();
    assert!(on_b.iter().all(|r| r.device == "A"));
    let m = merge(&base, &base, &on_b);
    assert!(m.for_a.apply.is_empty() && m.for_b.apply.is_empty());
}

#[test]
fn apagar_de_vez_em_um_aparelho_apaga_no_outro() {
    let (mut a, mut b) = (device("A"), device("B"));
    let id = note(&a, "Vai sumir");
    meet(&[], &mut a, &mut b);
    let base = export_records(a.connection()).unwrap();
    std::thread::sleep(std::time::Duration::from_millis(5));

    a.connection()
        .execute("DELETE FROM notes_note WHERE id = ?1", [&id])
        .unwrap();
    meet(&base, &mut a, &mut b);

    assert!(titles(&b).is_empty());
}

#[test]
fn edicao_dos_dois_lados_gera_copia_em_conflito_sem_perder_texto() {
    let (mut a, mut b) = (device("A"), device("B"));
    let id = note(&a, "Original");
    meet(&[], &mut a, &mut b);
    let base = export_records(a.connection()).unwrap();
    std::thread::sleep(std::time::Duration::from_millis(5));
    a.connection()
        .execute("UPDATE notes_note SET title = 'Do A' WHERE id = ?1", [&id])
        .unwrap();
    std::thread::sleep(std::time::Duration::from_millis(5));
    b.connection()
        .execute("UPDATE notes_note SET title = 'Do B' WHERE id = ?1", [&id])
        .unwrap();

    meet(&base, &mut a, &mut b);

    assert_eq!(
        titles(&a),
        ["Do A", "Do B"],
        "uma venceu, a outra virou cópia"
    );
    assert_eq!(titles(&a), titles(&b));
}

#[test]
fn base_de_dados_com_coluna_e_celula_atravessa_os_aparelhos() {
    let (mut a, mut b) = (device("A"), device("B"));
    let id = note(&a, "Pedidos");
    a.connection()
        .execute_batch(&format!(
            "INSERT INTO notes_database (note_id) VALUES ('{id}');
             INSERT INTO notes_property (id, database_id, name, kind, position) VALUES ('p1', '{id}', 'Obs', 'text', 0);
             INSERT INTO notes_cell (note_id, property_id, value) VALUES ('{id}', 'p1', '\"urgente\"');"
        ))
        .unwrap();

    meet(&[], &mut a, &mut b);

    let value: String = b
        .connection()
        .query_row(
            "SELECT value FROM notes_cell WHERE property_id = 'p1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(value, "\"urgente\"");
    let is_db: i64 = b
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM notes_database WHERE note_id = ?1",
            [&id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(is_db, 1);
}

#[test]
fn subpagina_chega_mesmo_antes_do_pai_na_lista() {
    let (mut a, mut b) = (device("A"), device("B"));
    let pai = note(&a, "Pai");
    service::create(
        a.connection(),
        NewNote {
            title: "Filha".into(),
            body: String::new(),
            parent_id: Some(pai),
        },
    )
    .unwrap();

    meet(&[], &mut a, &mut b);

    assert_eq!(titles(&b), ["Filha", "Pai"]);
}

#[test]
fn celula_de_coluna_que_sumiu_e_pulada_sem_erro() {
    let (a, mut b) = (device("A"), device("B"));
    let id = note(&a, "Base");
    a.connection()
        .execute_batch(&format!(
            "INSERT INTO notes_database (note_id) VALUES ('{id}');
             INSERT INTO notes_property (id, database_id, name, kind, position) VALUES ('p1', '{id}', 'C', 'text', 0);
             INSERT INTO notes_cell (note_id, property_id, value) VALUES ('{id}', 'p1', '1');"
        ))
        .unwrap();
    let only_cell: Vec<Record> = export_records(a.connection())
        .unwrap()
        .into_iter()
        .filter(|r| r.kind == "cell")
        .collect();

    let applied = apply_records(b.connection_mut(), &only_cell).unwrap();

    assert_eq!(applied, 1);
    let cells: i64 = b
        .connection()
        .query_row("SELECT COUNT(*) FROM notes_cell", [], |r| r.get(0))
        .unwrap();
    assert_eq!(cells, 0);
}
