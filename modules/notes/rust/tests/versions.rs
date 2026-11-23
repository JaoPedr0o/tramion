//! Testes do histórico de versões.

use tramion_infra_sqlite::Database;
use tramion_notes::MIGRATIONS;
use tramion_notes::model::{NewNote, Note, UpdateNote};
use tramion_notes::service;
use tramion_notes::versions::{
    MAX_VERSIONS, MIN_GAP_MS, get_version, list_versions, restore_version, snapshot_if_due,
};

fn db() -> Database {
    Database::open_in_memory(&[MIGRATIONS]).expect("as migrações reais devem aplicar")
}

fn page(db: &Database, title: &str) -> Note {
    service::create(
        db.connection(),
        NewNote {
            title: title.into(),
            body: String::new(),
            parent_id: None,
        },
    )
    .unwrap()
}

fn edit(db: &Database, note: &Note, title: &str, body: &str) -> Note {
    let current = service::get(db.connection(), &note.id).unwrap();
    service::update(
        db.connection(),
        UpdateNote {
            id: note.id.clone(),
            title: title.into(),
            body: body.into(),
            content: serde_json::json!([{ "type": "paragraph", "text": body }]).to_string(),
            expected_updated_at: current.updated_at,
        },
    )
    .unwrap()
}

fn count(db: &Database, note: &Note) -> usize {
    list_versions(db.connection(), &note.id).unwrap().len()
}

#[test]
fn primeira_edicao_de_pagina_vazia_nao_guarda_versao_vazia() {
    let db = db();
    let note = page(&db, "A");

    edit(&db, &note, "A", "primeiro texto");

    assert_eq!(count(&db, &note), 0);
}

#[test]
fn a_edicao_guarda_o_estado_anterior_e_nao_o_novo() {
    let db = db();
    let note = page(&db, "A");
    edit(&db, &note, "A", "texto antigo");

    edit(&db, &note, "A", "texto novo");

    let versions = list_versions(db.connection(), &note.id).unwrap();
    assert_eq!(versions.len(), 1);
    assert_eq!(versions[0].preview, "texto antigo");
    assert_eq!(
        get_version(db.connection(), &versions[0].id).unwrap().body,
        "texto antigo"
    );
}

#[test]
fn edicoes_seguidas_dentro_de_dez_minutos_nao_geram_varias_versoes() {
    let db = db();
    let note = page(&db, "A");
    edit(&db, &note, "A", "um");
    edit(&db, &note, "A", "dois");
    edit(&db, &note, "A", "tres");
    edit(&db, &note, "A", "quatro");

    assert_eq!(count(&db, &note), 1, "só o primeiro estado antigo entrou");
}

#[test]
fn politica_de_tempo_e_o_estado_vazio_sao_respeitados() {
    let db = db();
    let note = page(&db, "A");
    let filled = edit(&db, &note, "A", "algo");
    let t0 = 1_000_000_000_000;

    assert!(snapshot_if_due(db.connection(), &filled, t0, false).unwrap());
    assert!(
        !snapshot_if_due(db.connection(), &filled, t0 + MIN_GAP_MS - 1, false).unwrap(),
        "cedo demais"
    );
    assert!(
        snapshot_if_due(db.connection(), &filled, t0 + MIN_GAP_MS, false).unwrap(),
        "passou o intervalo"
    );
    assert!(
        snapshot_if_due(db.connection(), &filled, t0 + MIN_GAP_MS + 1, true).unwrap(),
        "forçado ignora o intervalo"
    );
    assert_eq!(count(&db, &note), 3);

    let empty = page(&db, "Vazia");
    assert!(
        !snapshot_if_due(db.connection(), &empty, t0, true).unwrap(),
        "estado vazio nunca"
    );
}

#[test]
fn sem_mudanca_de_titulo_ou_conteudo_nao_guarda() {
    let db = db();
    let note = page(&db, "A");
    let filled = edit(&db, &note, "A", "texto");
    let before = count(&db, &note);

    // Mesmos título e conteúdo: só o `body` muda.
    service::update(
        db.connection(),
        UpdateNote {
            id: note.id.clone(),
            title: "A".into(),
            body: "outro corpo".into(),
            content: filled.content.clone(),
            expected_updated_at: filled.updated_at,
        },
    )
    .unwrap();

    assert_eq!(count(&db, &note), before);
}

#[test]
fn a_mudanca_so_do_titulo_tambem_conta() {
    let db = db();
    let note = page(&db, "Antes");
    let filled = edit(&db, &note, "Antes", "texto");
    service::update(
        db.connection(),
        UpdateNote {
            id: note.id.clone(),
            title: "Depois".into(),
            body: "texto".into(),
            content: filled.content.clone(),
            expected_updated_at: filled.updated_at,
        },
    )
    .unwrap();

    assert_eq!(
        list_versions(db.connection(), &note.id).unwrap()[0].title,
        "Antes"
    );
}

#[test]
fn guarda_no_maximo_trinta_versoes_e_descarta_as_mais_antigas() {
    let db = db();
    let note = page(&db, "A");
    let filled = edit(&db, &note, "A", "estado 0");
    let t0 = 2_000_000_000_000;
    for i in 0..(MAX_VERSIONS + 5) {
        let mut state = filled.clone();
        state.body = format!("estado {i}");
        snapshot_if_due(db.connection(), &state, t0 + (i as i64) * MIN_GAP_MS, false).unwrap();
    }

    let versions = list_versions(db.connection(), &note.id).unwrap();

    assert_eq!(versions.len(), MAX_VERSIONS);
    assert_eq!(
        versions[0].preview,
        format!("estado {}", MAX_VERSIONS + 4),
        "a mais recente primeiro"
    );
    assert_eq!(
        versions.last().unwrap().preview,
        "estado 5",
        "as 5 mais antigas saíram"
    );
}

#[test]
fn a_previa_e_uma_linha_e_e_cortada_com_reticencias() {
    let db = db();
    let note = page(&db, "A");
    edit(
        &db,
        &note,
        "A",
        &format!("linha um\n\n{}  fim", "palavra ".repeat(60)),
    );
    edit(&db, &note, "A", "novo");

    let preview = &list_versions(db.connection(), &note.id).unwrap()[0].preview;

    assert!(preview.starts_with("linha um palavra"));
    assert!(!preview.contains('\n'));
    assert!(preview.ends_with('…'));
    assert!(preview.chars().count() <= 161);
}

#[test]
fn restaurar_volta_titulo_texto_e_conteudo_e_guarda_o_estado_atual_para_desfazer() {
    let db = db();
    let note = page(&db, "Título velho");
    edit(&db, &note, "Título velho", "texto velho");
    let current = edit(&db, &note, "Título novo", "texto novo");
    let old = list_versions(db.connection(), &note.id).unwrap()[0].clone();

    let restored = restore_version(db.connection(), &note.id, &old.id, current.updated_at).unwrap();

    assert_eq!(restored.title, "Título velho");
    assert_eq!(restored.body, "texto velho");
    assert!(restored.updated_at > current.updated_at);
    let after = list_versions(db.connection(), &note.id).unwrap();
    assert_eq!(
        after[0].preview, "texto novo",
        "o estado atual foi guardado (mesmo dentro dos 10 minutos)"
    );
    assert_eq!(after[0].title, "Título novo");

    // Dá para desfazer a restauração.
    let again =
        restore_version(db.connection(), &note.id, &after[0].id, restored.updated_at).unwrap();
    assert_eq!(again.body, "texto novo");
}

#[test]
fn restaurar_respeita_conflito_pagina_e_lixeira() {
    let db = db();
    let note = page(&db, "A");
    edit(&db, &note, "A", "um");
    let current = edit(&db, &note, "A", "dois");
    let other = page(&db, "Outra");
    edit(&db, &other, "Outra", "x");
    edit(&db, &other, "Outra", "y");
    let version = list_versions(db.connection(), &note.id).unwrap()[0].clone();
    let foreign = list_versions(db.connection(), &other.id).unwrap()[0].clone();

    let stale = restore_version(
        db.connection(),
        &note.id,
        &version.id,
        current.updated_at - 1,
    );
    assert_eq!(stale.unwrap_err().code(), "notes.conflict");
    let wrong = restore_version(db.connection(), &note.id, &foreign.id, current.updated_at);
    assert_eq!(
        wrong.unwrap_err().code(),
        "notes.not-found",
        "versão de outra página"
    );
    let missing = restore_version(db.connection(), &note.id, "nao-existe", current.updated_at);
    assert_eq!(missing.unwrap_err().code(), "notes.not-found");

    service::delete(db.connection(), &note.id).unwrap();
    let trashed = restore_version(db.connection(), &note.id, &version.id, current.updated_at);
    assert_eq!(trashed.unwrap_err().code(), "notes.in-trash");
}

#[test]
fn historico_de_pagina_inexistente_e_versao_inexistente() {
    let db = db();

    assert_eq!(
        list_versions(db.connection(), "nao-existe")
            .unwrap_err()
            .code(),
        "notes.not-found"
    );
    assert_eq!(
        get_version(db.connection(), "nao-existe")
            .unwrap_err()
            .code(),
        "notes.not-found"
    );
}

#[test]
fn as_versoes_sobrevivem_a_lixeira_e_somem_ao_apagar_de_vez() {
    let db = db();
    let note = page(&db, "A");
    edit(&db, &note, "A", "um");
    edit(&db, &note, "A", "dois");
    service::delete(db.connection(), &note.id).unwrap();
    service::restore(db.connection(), &note.id).unwrap();
    assert_eq!(count(&db, &note), 1);

    service::delete(db.connection(), &note.id).unwrap();
    service::purge(db.connection(), &note.id).unwrap();

    let left: i64 = db
        .connection()
        .query_row("SELECT COUNT(*) FROM notes_version", [], |r| r.get(0))
        .unwrap();
    assert_eq!(left, 0);
}

#[test]
fn edicao_com_conflito_nao_guarda_versao() {
    let db = db();
    let note = page(&db, "A");
    let filled = edit(&db, &note, "A", "um");
    let result = service::update(
        db.connection(),
        UpdateNote {
            id: note.id.clone(),
            title: "A".into(),
            body: "dois".into(),
            content: "[]".into(),
            expected_updated_at: filled.updated_at - 5,
        },
    );

    assert_eq!(result.unwrap_err().code(), "notes.conflict");
    assert_eq!(count(&db, &note), 0);
}
