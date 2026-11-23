//! Teste da migração 2 sobre um banco que JÁ TEM páginas criadas na versão 1, como o do usuário.

use aesthetic_infra_sqlite::rusqlite::Connection;
use aesthetic_infra_sqlite::{Database, ModuleMigrations, OpenOptions};
use aesthetic_notes::MIGRATIONS;
use aesthetic_notes::service;
use std::fs;
use tempfile::TempDir;

/// O módulo como era antes da migração 2 (só a primeira migração).
/// É uma função porque o Rust ainda não permite fatiar (`[..1]`) dentro de uma `const`.
fn v1_only() -> ModuleMigrations {
    ModuleMigrations {
        module: MIGRATIONS.module,
        depends_on: MIGRATIONS.depends_on,
        migrations: &MIGRATIONS.migrations[..1],
    }
}

#[test]
fn migracao_2_preserva_as_paginas_existentes_e_faz_backup_antes() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("app.db");
    let backups = dir.path().join("backups");
    let options = OpenOptions {
        backup_dir: Some(backups.clone()),
        backups_to_keep: 5,
    };

    // 1) Banco na versão 1, com páginas de verdade (uma já na lixeira).
    {
        let db = Database::open(&path, &[v1_only()], &options).unwrap();
        db.connection()
            .execute_batch(
                "INSERT INTO notes_note (id, title, body, updated_at) VALUES
                    ('old',  'antiga',   'corpo antigo',   100),
                    ('new',  'recente',  'corpo recente',  300),
                    ('mid',  'média',    'corpo médio',    200),
                    ('gone', 'apagada',  'corpo apagado',  999);
                 UPDATE notes_note SET deleted_at = 1 WHERE id = 'gone';",
            )
            .unwrap();
    }

    // 2) O app novo abre o mesmo banco: a migração 2 roda sobre esses dados.
    let db = Database::open(&path, &[MIGRATIONS], &options).unwrap();

    // Ordem preservada: mais recentes primeiro, todas na raiz.
    let listed = service::list(db.connection()).unwrap();
    let order: Vec<_> = listed.iter().map(|n| (n.id.as_str(), n.position)).collect();
    assert_eq!(order, [("new", 0), ("mid", 1), ("old", 2)]);
    assert!(listed.iter().all(|n| n.parent_id.is_none()));
    // O conteúdo não foi tocado.
    assert_eq!(
        service::get(db.connection(), "mid").unwrap().body,
        "corpo médio"
    );
    // A página que estava na lixeira continua lá.
    assert!(
        service::get(db.connection(), "gone")
            .unwrap()
            .deleted_at
            .is_some()
    );

    // 3) Backup feito ANTES de migrar: é o retrato da versão 1 (sem `parent_id`).
    let files: Vec<_> = fs::read_dir(&backups)
        .unwrap()
        .map(|e| e.unwrap().path())
        .collect();
    assert_eq!(files.len(), 1);
    let backup = Connection::open(&files[0]).unwrap();
    let applied: i64 = backup
        .query_row("SELECT COUNT(*) FROM _migrations", [], |r| r.get(0))
        .unwrap();
    assert_eq!(applied, 1);
    let has_parent: i64 = backup
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('notes_note') WHERE name = 'parent_id'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(has_parent, 0, "o backup é anterior à migração");
}

#[test]
fn migracao_2_troca_o_indice_e_impoe_as_defesas() {
    let db = Database::open_in_memory(&[MIGRATIONS]).unwrap();
    let index_exists = |name: &str| -> bool {
        db.connection()
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?1",
                [name],
                |r| r.get::<_, i64>(0),
            )
            .unwrap()
            > 0
    };

    assert!(
        !index_exists("notes_note_active_idx"),
        "o índice antigo foi removido"
    );
    assert!(index_exists("notes_note_tree_idx"));
}

/// O módulo como era antes da migração 3 (as duas primeiras).
fn v2_only() -> ModuleMigrations {
    ModuleMigrations {
        module: MIGRATIONS.module,
        depends_on: MIGRATIONS.depends_on,
        migrations: &MIGRATIONS.migrations[..2],
    }
}

#[test]
fn migracao_3_preserva_paginas_existentes_com_conteudo_vazio_e_o_texto_intacto() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("app.db");
    let options = OpenOptions {
        backup_dir: Some(dir.path().join("backups")),
        backups_to_keep: 5,
    };
    {
        let db = Database::open(&path, &[v2_only()], &options).unwrap();
        db.connection()
            .execute(
                "INSERT INTO notes_note (id, title, body) VALUES ('a', 'antiga', 'texto que já existia')",
                [],
            )
            .unwrap();
    }

    let db = Database::open(&path, &[MIGRATIONS], &options).unwrap();

    let note = service::get(db.connection(), "a").unwrap();
    assert_eq!(
        note.body, "texto que já existia",
        "o texto simples não foi tocado"
    );
    assert_eq!(
        note.content, "[]",
        "ainda não convertida: a interface converte ao abrir"
    );
}

/// O módulo como era antes da migração 4 (as três primeiras).
fn v3_only() -> ModuleMigrations {
    ModuleMigrations {
        module: MIGRATIONS.module,
        depends_on: MIGRATIONS.depends_on,
        migrations: &MIGRATIONS.migrations[..3],
    }
}

#[test]
fn migracao_4_preserva_paginas_existentes_sem_simbolo_nem_capa() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("app.db");
    let options = OpenOptions {
        backup_dir: Some(dir.path().join("backups")),
        backups_to_keep: 5,
    };
    {
        let db = Database::open(&path, &[v3_only()], &options).unwrap();
        db.connection()
            .execute("INSERT INTO notes_note (id, title, body, content) VALUES ('a', 'antiga', 'texto', '[]')", [])
            .unwrap();
    }

    let db = Database::open(&path, &[MIGRATIONS], &options).unwrap();

    let note = service::get(db.connection(), "a").unwrap();
    assert_eq!((note.icon, note.cover), (None, None));
    assert_eq!(note.body, "texto", "o conteúdo não foi tocado");
}
