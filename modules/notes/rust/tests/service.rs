//! Testes das regras de negócio das notas, com banco em memória e as migrações reais.

use aun_infra_sqlite::Database;
use aun_notes::error::NotesError;
use aun_notes::model::{NewNote, Note, UpdateNote};
use aun_notes::service::{self, MAX_TITLE_CHARS};
use aun_notes::{MIGRATIONS, repository};

fn db() -> Database {
    Database::open_in_memory(&[MIGRATIONS]).expect("as migrações reais devem aplicar")
}

fn new(db: &Database, title: &str, body: &str) -> Note {
    service::create(
        db.connection(),
        NewNote {
            title: title.into(),
            body: body.into(),
        },
    )
    .unwrap()
}

fn edit(db: &Database, note: &Note, title: &str, body: &str) -> Result<Note, NotesError> {
    service::update(
        db.connection(),
        UpdateNote {
            id: note.id.clone(),
            title: title.into(),
            body: body.into(),
            expected_updated_at: note.updated_at,
        },
    )
}

fn active_ids(db: &Database) -> Vec<String> {
    service::list(db.connection())
        .unwrap()
        .into_iter()
        .map(|n| n.id)
        .collect()
}

fn trash_ids(db: &Database) -> Vec<String> {
    service::list_trash(db.connection())
        .unwrap()
        .into_iter()
        .map(|n| n.id)
        .collect()
}

// ───────── criar ─────────

#[test]
fn criar_devolve_a_nota_com_os_valores_padrao() {
    let db = db();
    let note = new(&db, "Compras", "leite");

    assert_eq!(note.title, "Compras");
    assert_eq!(note.body, "leite");
    assert!(!note.pinned);
    assert_eq!(note.deleted_at, None);
    assert_eq!(note.id.len(), 32);
    assert_eq!(note.created_at, note.updated_at);
}

#[test]
fn criar_remove_espacos_das_pontas_do_titulo_mas_preserva_o_corpo() {
    let db = db();
    let note = new(&db, "  Título  ", "  corpo com espaços  ");

    assert_eq!(note.title, "Título");
    assert_eq!(note.body, "  corpo com espaços  ");
}

#[test]
fn criar_recusa_titulo_vazio_ou_so_espacos_sem_gravar_nada() {
    let db = db();
    for title in ["", "   ", "\t\n"] {
        let result = service::create(
            db.connection(),
            NewNote {
                title: title.into(),
                body: String::new(),
            },
        );
        assert!(
            matches!(result, Err(NotesError::TitleEmpty)),
            "título {title:?}"
        );
    }
    assert!(active_ids(&db).is_empty());
}

#[test]
fn titulo_e_medido_em_caracteres_e_nao_em_bytes() {
    let db = db();
    // "é" ocupa 2 bytes. 200 deles são 400 bytes, mas só 200 caracteres: tem que ser aceito.
    assert!(
        service::create(
            db.connection(),
            NewNote {
                title: "é".repeat(MAX_TITLE_CHARS),
                body: String::new()
            }
        )
        .is_ok()
    );

    let result = service::create(
        db.connection(),
        NewNote {
            title: "é".repeat(MAX_TITLE_CHARS + 1),
            body: String::new(),
        },
    );
    assert!(matches!(result, Err(NotesError::TitleTooLong { max: 200 })));
}

// ───────── ler ─────────

#[test]
fn get_devolve_a_nota_inclusive_na_lixeira_e_not_found_se_nao_existe() {
    let db = db();
    let note = new(&db, "A", "corpo");
    service::delete(db.connection(), &note.id).unwrap();

    let found = service::get(db.connection(), &note.id).unwrap();
    assert_eq!(found.body, "corpo");
    assert!(found.deleted_at.is_some());

    assert!(matches!(
        service::get(db.connection(), "nao-existe"),
        Err(NotesError::NotFound)
    ));
}

// ───────── editar e conflitos ─────────

#[test]
fn editar_muda_titulo_e_corpo_e_aumenta_a_versao() {
    let db = db();
    let note = new(&db, "Velho", "antigo");

    let edited = edit(&db, &note, "  Novo  ", "novo corpo").unwrap();

    assert_eq!(
        (edited.title.as_str(), edited.body.as_str()),
        ("Novo", "novo corpo")
    );
    assert!(edited.updated_at > note.updated_at);
    assert_eq!(edited.created_at, note.created_at);
}

#[test]
fn editar_a_partir_de_versao_desatualizada_e_recusado_e_nao_altera_a_nota() {
    let db = db();
    let note = new(&db, "Original", "");
    let first = edit(&db, &note, "Edição 1", "").unwrap();

    // `note` é a versão que uma segunda janela leu ANTES da edição 1.
    let result = edit(&db, &note, "Edição 2 (velha)", "");

    match result {
        Err(NotesError::Conflict { current_updated_at }) => {
            assert_eq!(current_updated_at, first.updated_at);
        }
        outro => panic!("esperava conflito, veio {outro:?}"),
    }
    assert_eq!(
        service::get(db.connection(), &note.id).unwrap().title,
        "Edição 1"
    );
}

#[test]
fn a_versao_sempre_aumenta_mesmo_com_edicoes_no_mesmo_milissegundo() {
    let db = db();
    let mut note = new(&db, "Rápida", "");

    // Dezenas de edições encadeadas, rápidas o bastante para caírem no mesmo milissegundo.
    for i in 0..100 {
        let next = edit(&db, &note, "Rápida", &format!("v{i}")).unwrap();
        assert!(
            next.updated_at > note.updated_at,
            "a versão não pode repetir nem voltar"
        );
        note = next;
    }
}

#[test]
fn editar_com_titulo_invalido_nao_altera_a_nota() {
    let db = db();
    let note = new(&db, "Ok", "corpo");

    let result = edit(&db, &note, "   ", "corpo novo");

    assert!(matches!(result, Err(NotesError::TitleEmpty)));
    let unchanged = service::get(db.connection(), &note.id).unwrap();
    assert_eq!(
        (unchanged.title.as_str(), unchanged.body.as_str()),
        ("Ok", "corpo")
    );
    assert_eq!(unchanged.updated_at, note.updated_at);
}

#[test]
fn editar_nota_inexistente_ou_na_lixeira_da_o_erro_certo() {
    let db = db();
    let ghost = Note {
        id: "fantasma".into(),
        title: "x".into(),
        body: String::new(),
        pinned: false,
        created_at: 0,
        updated_at: 0,
        deleted_at: None,
    };
    assert!(matches!(
        edit(&db, &ghost, "y", ""),
        Err(NotesError::NotFound)
    ));

    let note = new(&db, "Vai pra lixeira", "");
    service::delete(db.connection(), &note.id).unwrap();
    assert!(matches!(
        edit(&db, &note, "y", ""),
        Err(NotesError::InTrash)
    ));
}

// ───────── fixar ─────────

#[test]
fn fixar_sobe_a_nota_para_o_topo_sem_mexer_na_versao() {
    let db = db();
    let a = new(&db, "A", "");
    let b = new(&db, "B", "");
    // Garante B como a mais recente.
    let b = edit(&db, &b, "B", "mais recente").unwrap();
    assert_eq!(active_ids(&db), [b.id.clone(), a.id.clone()]);

    let pinned = service::set_pinned(db.connection(), &a.id, true).unwrap();

    assert!(pinned.pinned);
    assert_eq!(
        pinned.updated_at, a.updated_at,
        "organizar não é editar o conteúdo"
    );
    assert_eq!(active_ids(&db), [a.id.clone(), b.id.clone()]);

    service::set_pinned(db.connection(), &a.id, false).unwrap();
    assert_eq!(active_ids(&db), [b.id, a.id]);
}

#[test]
fn fixar_nota_inexistente_ou_na_lixeira_da_o_erro_certo() {
    let db = db();
    assert!(matches!(
        service::set_pinned(db.connection(), "nao-existe", true),
        Err(NotesError::NotFound)
    ));

    let note = new(&db, "A", "");
    service::delete(db.connection(), &note.id).unwrap();
    assert!(matches!(
        service::set_pinned(db.connection(), &note.id, true),
        Err(NotesError::InTrash)
    ));
}

// ───────── lixeira ─────────

#[test]
fn excluir_move_para_a_lixeira_e_restaurar_traz_de_volta_intacta() {
    let db = db();
    let note = new(&db, "Importante", "não pode se perder");

    service::delete(db.connection(), &note.id).unwrap();
    assert!(active_ids(&db).is_empty());
    assert_eq!(trash_ids(&db), [note.id.as_str()]);

    service::restore(db.connection(), &note.id).unwrap();
    assert_eq!(active_ids(&db), [note.id.as_str()]);
    assert!(trash_ids(&db).is_empty());

    let back = service::get(db.connection(), &note.id).unwrap();
    assert_eq!(back.body, "não pode se perder");
    assert_eq!(
        back.updated_at, note.updated_at,
        "excluir/restaurar não é editar"
    );
}

#[test]
fn excluir_e_restaurar_sao_idempotentes_mas_nota_inexistente_e_erro() {
    let db = db();
    let note = new(&db, "A", "");

    service::delete(db.connection(), &note.id).unwrap();
    service::delete(db.connection(), &note.id).unwrap();
    service::restore(db.connection(), &note.id).unwrap();
    service::restore(db.connection(), &note.id).unwrap();

    assert!(matches!(
        service::delete(db.connection(), "nao-existe"),
        Err(NotesError::NotFound)
    ));
    assert!(matches!(
        service::restore(db.connection(), "nao-existe"),
        Err(NotesError::NotFound)
    ));
}

#[test]
fn a_lixeira_lista_as_excluidas_mais_recentemente_primeiro() {
    let db = db();
    let a = new(&db, "A", "");
    let b = new(&db, "B", "");
    repository_set_deleted_at(&db, &a.id, 1_000);
    repository_set_deleted_at(&db, &b.id, 2_000);

    assert_eq!(trash_ids(&db), [b.id, a.id]);
}

/// Força um `deleted_at` conhecido para testar a ordenação sem depender do relógio.
fn repository_set_deleted_at(db: &Database, id: &str, at: i64) {
    db.connection()
        .execute(
            "UPDATE notes_note SET deleted_at = ?2 WHERE id = ?1",
            (id, at),
        )
        .unwrap();
}

#[test]
fn excluir_de_vez_so_vale_na_lixeira_e_nunca_apaga_nota_ativa() {
    let db = db();
    let note = new(&db, "Ativa", "");

    assert!(matches!(
        service::purge(db.connection(), &note.id),
        Err(NotesError::NotInTrash)
    ));
    assert!(
        repository::find(db.connection(), &note.id)
            .unwrap()
            .is_some(),
        "segue intacta"
    );

    service::delete(db.connection(), &note.id).unwrap();
    service::purge(db.connection(), &note.id).unwrap();

    assert!(
        repository::find(db.connection(), &note.id)
            .unwrap()
            .is_none()
    );
    assert!(matches!(
        service::purge(db.connection(), &note.id),
        Err(NotesError::NotFound)
    ));
}

// ───────── listagem ─────────

#[test]
fn listagem_traz_fixadas_primeiro_depois_as_mais_recentes_e_so_ativas() {
    let db = db();
    let old = new(&db, "antiga", "");
    let recent = new(&db, "recente", "");
    let pinned = new(&db, "fixada", "");
    let gone = new(&db, "apagada", "");
    service::set_pinned(db.connection(), &pinned.id, true).unwrap();
    service::delete(db.connection(), &gone.id).unwrap();
    repository_set_updated_at(&db, &old.id, 100);
    repository_set_updated_at(&db, &recent.id, 300);

    assert_eq!(active_ids(&db), [pinned.id, recent.id, old.id]);
}

fn repository_set_updated_at(db: &Database, id: &str, at: i64) {
    db.connection()
        .execute(
            "UPDATE notes_note SET updated_at = ?2 WHERE id = ?1",
            (id, at),
        )
        .unwrap();
}

#[test]
fn codigos_de_erro_sao_estaveis() {
    // A interface depende destes textos: mudá-los quebra a tradução das mensagens.
    assert_eq!(NotesError::TitleEmpty.code(), "notes.title-empty");
    assert_eq!(
        NotesError::TitleTooLong { max: 1 }.code(),
        "notes.title-too-long"
    );
    assert_eq!(NotesError::NotFound.code(), "notes.not-found");
    assert_eq!(NotesError::InTrash.code(), "notes.in-trash");
    assert_eq!(NotesError::NotInTrash.code(), "notes.not-in-trash");
    assert_eq!(
        NotesError::Conflict {
            current_updated_at: 1
        }
        .code(),
        "notes.conflict"
    );
    assert_eq!(NotesError::Internal(String::new()).code(), "notes.internal");
}
