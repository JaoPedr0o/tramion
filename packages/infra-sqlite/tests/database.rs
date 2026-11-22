//! Testes da API pública: abrir, migrar, recusar bancos suspeitos e fazer backup.

use aun_infra_sqlite::{Database, DbError, Migration, ModuleMigrations, OpenOptions};
use rusqlite::Connection;
use std::fs;
use std::path::Path;
use tempfile::TempDir;

// Migrações de exemplo (nenhum módulo real existe ainda). `static`/`const` mantêm o `'static`.
static NOTES_ALL: [Migration; 4] = [
    Migration {
        version: 1,
        sql: "CREATE TABLE notes_note (id TEXT PRIMARY KEY, title TEXT NOT NULL);",
    },
    Migration {
        version: 2,
        sql: "ALTER TABLE notes_note ADD COLUMN body TEXT NOT NULL DEFAULT '';",
    },
    Migration {
        version: 3,
        sql: "ALTER TABLE notes_note ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;",
    },
    Migration {
        version: 4,
        sql: "ALTER TABLE notes_note ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;",
    },
];

/// As primeiras `n` migrações de notas: simula o app evoluindo de versão em versão.
fn notes_upto(n: usize) -> ModuleMigrations {
    ModuleMigrations {
        module: "notes",
        depends_on: &[],
        migrations: &NOTES_ALL[..n],
    }
}

// "tasks" depende de "notes": a migração DELE insere numa tabela de "notes".
// Se a ordem estiver errada, essa inserção falha por a tabela não existir.
const TASKS: ModuleMigrations = ModuleMigrations {
    module: "tasks",
    depends_on: &["notes"],
    migrations: &[Migration {
        version: 1,
        sql:
            "CREATE TABLE tasks_task (id TEXT PRIMARY KEY, note_id TEXT REFERENCES notes_note(id));
              INSERT INTO notes_note (id, title) VALUES ('seed', 'criada por tasks');",
    }],
};

fn with_backups(dir: &Path, keep: usize) -> OpenOptions {
    OpenOptions {
        backup_dir: Some(dir.join("backups")),
        backups_to_keep: keep,
    }
}

fn applied(db_path: &Path) -> Vec<String> {
    let conn = Connection::open(db_path).unwrap();
    let mut stmt = conn
        .prepare("SELECT module || ':' || version FROM _migrations ORDER BY rowid")
        .unwrap();
    stmt.query_map([], |row| row.get(0))
        .unwrap()
        .map(Result::unwrap)
        .collect()
}

fn table_exists(db_path: &Path, table: &str) -> bool {
    let conn = Connection::open(db_path).unwrap();
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE name = ?1",
        [table],
        |r| r.get::<_, i64>(0),
    )
    .unwrap()
        > 0
}

fn backups(dir: &Path) -> Vec<std::path::PathBuf> {
    let Ok(entries) = fs::read_dir(dir.join("backups")) else {
        return vec![];
    };
    let mut files: Vec<_> = entries.map(|e| e.unwrap().path()).collect();
    files.sort();
    files
}

#[test]
fn aplica_as_migracoes_na_ordem_das_dependencias() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("app.db");

    // Passadas "ao contrário" de propósito.
    Database::open(&path, &[TASKS, notes_upto(2)], &OpenOptions::default()).unwrap();

    assert_eq!(applied(&path), ["notes:1", "notes:2", "tasks:1"]);
}

#[test]
fn abrir_de_novo_nao_reaplica_nada() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("app.db");
    Database::open(&path, &[notes_upto(2)], &with_backups(dir.path(), 5)).unwrap();

    Database::open(&path, &[notes_upto(2)], &with_backups(dir.path(), 5)).unwrap();

    assert_eq!(applied(&path), ["notes:1", "notes:2"]);
    assert!(
        backups(dir.path()).is_empty(),
        "sem migração pendente, sem backup"
    );
}

#[test]
fn migracao_que_falha_e_desfeita_por_completo() {
    static BAD: [Migration; 2] = [
        Migration {
            version: 1,
            sql: "CREATE TABLE boa (id INTEGER);",
        },
        // A 1ª instrução funcionaria sozinha; a 2ª falha. Nenhuma das duas pode sobrar.
        Migration {
            version: 2,
            sql: "CREATE TABLE meio_criada (id INTEGER); INSERT INTO nao_existe VALUES (1);",
        },
    ];
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("app.db");
    let set = ModuleMigrations {
        module: "ruim",
        depends_on: &[],
        migrations: &BAD,
    };

    let result = Database::open(&path, &[set], &OpenOptions::default());

    assert!(matches!(
        result,
        Err(DbError::MigrationFailed { version: 2, .. })
    ));
    assert_eq!(
        applied(&path),
        ["ruim:1"],
        "a v1 já estava confirmada e permanece"
    );
    assert!(table_exists(&path, "boa"));
    assert!(
        !table_exists(&path, "meio_criada"),
        "a v2 não pode deixar rastros"
    );
}

#[test]
fn recusa_migracao_editada_depois_de_aplicada() {
    static EDITED: [Migration; 1] = [Migration {
        version: 1,
        sql: "CREATE TABLE notes_note (id TEXT PRIMARY KEY);",
    }];
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("app.db");
    Database::open(&path, &[notes_upto(1)], &OpenOptions::default()).unwrap();

    let edited = ModuleMigrations {
        module: "notes",
        depends_on: &[],
        migrations: &EDITED,
    };
    let result = Database::open(&path, &[edited], &OpenOptions::default());

    assert!(matches!(
        result,
        Err(DbError::ChecksumMismatch { version: 1, .. })
    ));
}

#[test]
fn recusa_banco_mais_novo_que_o_app() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("app.db");
    Database::open(&path, &[notes_upto(3)], &OpenOptions::default()).unwrap();

    // O "app antigo" só conhece até a versão 2.
    let result = Database::open(&path, &[notes_upto(2)], &OpenOptions::default());

    assert!(matches!(
        result,
        Err(DbError::UnknownAppliedMigration { version: 3, .. })
    ));
}

#[test]
fn recusa_arquivo_que_nao_e_um_banco_sem_altera_lo() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("app.db");
    let lixo = b"isto nao e um banco de dados sqlite, e sim um texto qualquer bem comprido";
    fs::write(&path, lixo).unwrap();

    let result = Database::open(&path, &[notes_upto(1)], &OpenOptions::default());

    assert!(matches!(result, Err(DbError::Corrupted(_))));
    assert_eq!(
        fs::read(&path).unwrap(),
        lixo,
        "o arquivo suspeito não pode ser modificado"
    );
}

#[test]
fn faz_backup_antes_de_migrar_mas_nao_em_banco_novo() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("app.db");

    Database::open(&path, &[notes_upto(1)], &with_backups(dir.path(), 5)).unwrap();
    assert!(
        backups(dir.path()).is_empty(),
        "banco novo não tem o que proteger"
    );

    Database::open(&path, &[notes_upto(2)], &with_backups(dir.path(), 5)).unwrap();
    let files = backups(dir.path());
    assert_eq!(files.len(), 1);
    // O backup é o retrato do banco ANTES da migração: tem só a v1.
    assert_eq!(applied(&files[0]), ["notes:1"]);
}

#[test]
fn mantem_apenas_os_backups_mais_recentes() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("app.db");

    for n in 1..=4 {
        Database::open(&path, &[notes_upto(n)], &with_backups(dir.path(), 2)).unwrap();
    }

    // 3 migrações pendentes depois da 1ª abertura = 3 backups feitos; só 2 ficam.
    let files = backups(dir.path());
    assert_eq!(files.len(), 2);
    let versions: Vec<_> = files.iter().map(|f| applied(f).len()).collect();
    assert_eq!(
        versions,
        [2, 3],
        "ficam os dois mais recentes (bancos com 2 e 3 migrações)"
    );
}

#[test]
fn nao_faz_backup_se_nao_foi_configurado() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("app.db");
    Database::open(&path, &[notes_upto(1)], &OpenOptions::default()).unwrap();

    Database::open(&path, &[notes_upto(2)], &OpenOptions::default()).unwrap();

    assert!(backups(dir.path()).is_empty());
}

#[test]
fn chaves_estrangeiras_sao_impostas() {
    let db = Database::open_in_memory(&[notes_upto(1), TASKS]).unwrap();

    let result = db.connection().execute(
        "INSERT INTO tasks_task (id, note_id) VALUES ('t1', 'nota-que-nao-existe')",
        [],
    );

    // Nota: com a build "bundled" isto passa mesmo sem o PRAGMA explícito (ver `configure`).
    // O teste vale como rede de segurança caso essa premissa mude.
    assert!(
        result.is_err(),
        "o SQLite só impõe FK se `foreign_keys` estiver ligado"
    );
}

#[test]
fn valida_as_migracoes_antes_de_criar_o_arquivo() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("app.db");
    let orfa = ModuleMigrations {
        module: "tasks",
        depends_on: &["fantasma"],
        migrations: &[],
    };

    let result = Database::open(&path, &[orfa], &OpenOptions::default());

    assert!(matches!(result, Err(DbError::MissingDependency { .. })));
    assert!(
        !path.exists(),
        "configuração inválida não deve nem criar o banco"
    );
}
