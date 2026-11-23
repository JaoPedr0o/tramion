//! Testes do conteúdo em blocos: o Rust guarda e valida; quem interpreta os blocos é o editor.

use tramion_infra_sqlite::Database;
use tramion_notes::MIGRATIONS;
use tramion_notes::error::NotesError;
use tramion_notes::model::{NewNote, Note, UpdateNote};
use tramion_notes::service::{self, MAX_CONTENT_BYTES};

fn db() -> Database {
    Database::open_in_memory(&[MIGRATIONS]).expect("as migrações reais devem aplicar")
}

fn page(db: &Database) -> Note {
    service::create(
        db.connection(),
        NewNote {
            title: "A".into(),
            body: String::new(),
            parent_id: None,
        },
    )
    .unwrap()
}

fn save(db: &Database, note: &Note, body: &str, content: &str) -> Result<Note, NotesError> {
    service::update(
        db.connection(),
        UpdateNote {
            id: note.id.clone(),
            title: note.title.clone(),
            body: body.into(),
            content: content.into(),
            expected_updated_at: note.updated_at,
        },
    )
}

const BLOCKS: &str = r#"[{"id":"1","type":"paragraph","content":"olá"},{"id":"2","type":"childPage","props":{"pageId":"x"}}]"#;

#[test]
fn pagina_nova_comeca_com_conteudo_vazio() {
    let db = db();

    assert_eq!(page(&db).content, "[]");
}

#[test]
fn guarda_os_blocos_e_o_texto_simples_e_devolve_ao_ler() {
    let db = db();
    let note = page(&db);

    let saved = save(&db, &note, "olá", BLOCKS).unwrap();

    assert_eq!(
        saved.content, BLOCKS,
        "o JSON é guardado exatamente como veio"
    );
    assert_eq!(saved.body, "olá");
    let read = service::get(db.connection(), &note.id).unwrap();
    assert_eq!((read.content.as_str(), read.body.as_str()), (BLOCKS, "olá"));
}

#[test]
fn conteudo_que_nao_e_uma_lista_em_json_e_recusado_sem_alterar_a_pagina() {
    let db = db();
    let note = page(&db);
    let good = save(&db, &note, "ok", BLOCKS).unwrap();

    for bad in ["", "isto não é json", "{", "{}", "null", "\"texto\"", "42"] {
        let result = save(&db, &good, "novo", bad);
        assert!(
            matches!(result, Err(NotesError::ContentInvalid)),
            "conteúdo {bad:?}"
        );
    }

    let unchanged = service::get(db.connection(), &note.id).unwrap();
    assert_eq!(unchanged.content, BLOCKS);
    assert_eq!(unchanged.updated_at, good.updated_at, "a versão não mudou");
}

#[test]
fn aceita_a_lista_vazia() {
    let db = db();
    let note = page(&db);

    assert_eq!(save(&db, &note, "", "[]").unwrap().content, "[]");
}

#[test]
fn conteudo_grande_demais_e_recusado() {
    let db = db();
    let note = page(&db);
    // Uma lista JSON válida, só que maior que o limite.
    let huge = format!("[\"{}\"]", "a".repeat(MAX_CONTENT_BYTES));

    let result = save(&db, &note, "", &huge);

    assert!(matches!(result, Err(NotesError::ContentTooLarge { .. })));
}

#[test]
fn o_proprio_banco_recusa_json_invalido() {
    let db = db();
    let note = page(&db);

    let result = db.connection().execute(
        "UPDATE notes_note SET content = 'não é json' WHERE id = ?1",
        [&note.id],
    );

    assert!(result.is_err(), "CHECK (json_valid(content))");
}

#[test]
fn codigos_de_erro_do_conteudo_sao_estaveis() {
    assert_eq!(NotesError::ContentInvalid.code(), "notes.content-invalid");
    assert_eq!(
        NotesError::ContentTooLarge { max: 1 }.code(),
        "notes.content-too-large"
    );
}
