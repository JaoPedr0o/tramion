//! Testes do esquema e do repositório, com banco em memória e as migrações reais do módulo.

use aesthetic_infra_sqlite::Database;
use aesthetic_notes::{MIGRATIONS, repository};

fn db() -> Database {
    Database::open_in_memory(&[MIGRATIONS]).expect("as migrações reais devem aplicar")
}

#[test]
fn banco_novo_lista_zero_notas() {
    assert!(
        repository::list_active(db().connection())
            .unwrap()
            .is_empty()
    );
}

#[test]
fn defaults_geram_id_pinned_e_datas() {
    let db = db();
    db.connection()
        .execute("INSERT INTO notes_note (title) VALUES ('Olá')", [])
        .unwrap();

    let (id, pinned, created, updated): (String, i64, i64, i64) = db
        .connection()
        .query_row(
            "SELECT id, pinned, created_at, updated_at FROM notes_note",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .unwrap();

    assert_eq!(id.len(), 32);
    assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
    assert_eq!(pinned, 0);
    assert!(
        created > 1_700_000_000_000,
        "milissegundos desde 1970, não segundos"
    );
    assert_eq!(created, updated);
}

#[test]
fn titulo_vazio_ou_gigante_e_recusado_pelo_proprio_banco() {
    let db = db();
    let insert = |title: &str| {
        db.connection()
            .execute("INSERT INTO notes_note (title) VALUES (?1)", [title])
    };

    assert!(insert("").is_err());
    assert!(insert("   ").is_err());
    assert!(insert(&"x".repeat(201)).is_err());
    assert!(insert(&"x".repeat(200)).is_ok());
}

#[test]
fn lista_so_as_ativas_na_ordem_das_posicoes() {
    let db = db();
    db.connection()
        .execute_batch(
            "INSERT INTO notes_note (id, title, pinned, updated_at, position) VALUES
                ('a', 'terceira', 0, 100, 2),
                ('b', 'primeira', 0, 300, 0),
                ('c', 'segunda',  1,  50, 1),
                ('d', 'apagada',  0, 999, 3);
             UPDATE notes_note SET deleted_at = 1 WHERE id = 'd';",
        )
        .unwrap();

    let ids: Vec<String> = repository::list_active(db.connection())
        .unwrap()
        .into_iter()
        .map(|n| n.id)
        .collect();

    assert_eq!(ids, ["b", "c", "a"]);
}
