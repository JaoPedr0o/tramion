//! Testes da hierarquia de páginas: criar sob um pai, mover, excluir/restaurar/apagar subárvores.
//! Usam banco em memória e as migrações reais.

use aun_infra_sqlite::Database;
use aun_notes::MIGRATIONS;
use aun_notes::error::NotesError;
use aun_notes::model::{MoveNote, NewNote, Note};
use aun_notes::service;

fn db() -> Database {
    Database::open_in_memory(&[MIGRATIONS]).expect("as migrações reais devem aplicar")
}

fn create(db: &Database, title: &str, parent: Option<&Note>) -> Result<Note, NotesError> {
    service::create(
        db.connection(),
        NewNote {
            title: title.into(),
            body: String::new(),
            parent_id: parent.map(|p| p.id.clone()),
        },
    )
}

fn page(db: &Database, title: &str, parent: Option<&Note>) -> Note {
    create(db, title, parent).unwrap()
}

fn mv(db: &Database, note: &Note, parent: Option<&Note>, index: usize) -> Result<Note, NotesError> {
    service::move_note(
        db.connection(),
        MoveNote {
            id: note.id.clone(),
            new_parent_id: parent.map(|p| p.id.clone()),
            index,
        },
    )
}

fn fresh(db: &Database, note: &Note) -> Note {
    service::get(db.connection(), &note.id).unwrap()
}

/// Ids das filhas ATIVAS de um pai (`None` = raiz), na ordem das posições.
fn children(db: &Database, parent: Option<&Note>) -> Vec<String> {
    let parent_id = parent.map(|p| p.id.as_str());
    service::list(db.connection())
        .unwrap()
        .into_iter()
        .filter(|n| n.parent_id.as_deref() == parent_id)
        .map(|n| n.id)
        .collect()
}

fn positions(db: &Database, parent: Option<&Note>) -> Vec<i64> {
    let parent_id = parent.map(|p| p.id.as_str());
    service::list(db.connection())
        .unwrap()
        .into_iter()
        .filter(|n| n.parent_id.as_deref() == parent_id)
        .map(|n| n.position)
        .collect()
}

fn ids(notes: &[&Note]) -> Vec<String> {
    notes.iter().map(|n| n.id.clone()).collect()
}

fn sorted(mut v: Vec<String>) -> Vec<String> {
    v.sort();
    v
}

fn trash_roots(db: &Database) -> Vec<(String, i64)> {
    service::list_trash(db.connection())
        .unwrap()
        .into_iter()
        .map(|t| (t.id, t.descendant_count))
        .collect()
}

// ───────── criar ─────────

#[test]
fn criar_acrescenta_no_fim_das_irmas_na_raiz_e_sob_um_pai() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", None);
    let c = page(&db, "C", Some(&a));
    let d = page(&db, "D", Some(&a));

    assert_eq!(children(&db, None), ids(&[&a, &b]));
    assert_eq!(positions(&db, None), [0, 1]);
    assert_eq!(children(&db, Some(&a)), ids(&[&c, &d]));
    assert_eq!(positions(&db, Some(&a)), [0, 1]);
}

#[test]
fn criar_sob_pai_inexistente_ou_na_lixeira_e_recusado_sem_criar_nada() {
    let db = db();
    let ghost = Note {
        id: "fantasma".into(),
        ..page(&db, "x", None)
    };
    assert!(matches!(
        create(&db, "filha", Some(&ghost)),
        Err(NotesError::ParentNotFound)
    ));

    let parent = page(&db, "pai", None);
    service::delete(db.connection(), &parent.id).unwrap();
    assert!(matches!(
        create(&db, "filha", Some(&parent)),
        Err(NotesError::ParentInTrash)
    ));

    assert_eq!(
        service::list(db.connection()).unwrap().len(),
        1,
        "só a página 'x' existe ativa"
    );
}

// ───────── mover ─────────

#[test]
fn mover_para_outro_pai_renumera_a_origem_e_o_destino() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", None);
    let c = page(&db, "C", Some(&a));
    let d = page(&db, "D", Some(&a));
    let e = page(&db, "E", Some(&a));

    let moved = mv(&db, &d, Some(&b), 0).unwrap();

    assert_eq!(moved.parent_id.as_deref(), Some(b.id.as_str()));
    assert_eq!(children(&db, Some(&a)), ids(&[&c, &e]));
    assert_eq!(
        positions(&db, Some(&a)),
        [0, 1],
        "a lacuna da origem foi fechada"
    );
    assert_eq!(children(&db, Some(&b)), ids(&[&d]));
    assert_eq!(positions(&db, Some(&b)), [0]);
}

#[test]
fn mover_dentro_do_mesmo_pai_reordena() {
    let db = db();
    let x = page(&db, "X", None);
    let y = page(&db, "Y", None);
    let z = page(&db, "Z", None);

    mv(&db, &x, None, 2).unwrap();
    assert_eq!(children(&db, None), ids(&[&y, &z, &x]));

    mv(&db, &z, None, 0).unwrap();
    assert_eq!(children(&db, None), ids(&[&z, &y, &x]));
    assert_eq!(positions(&db, None), [0, 1, 2]);
}

#[test]
fn indice_alem_do_fim_vira_no_fim() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", None);
    let c = page(&db, "C", None);

    mv(&db, &a, None, 99).unwrap();

    assert_eq!(children(&db, None), ids(&[&b, &c, &a]));
    assert_eq!(positions(&db, None), [0, 1, 2]);
}

#[test]
fn mover_para_a_raiz() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", None);
    let c = page(&db, "C", Some(&a));

    mv(&db, &c, None, 0).unwrap();

    assert_eq!(children(&db, None), ids(&[&c, &a, &b]));
    assert_eq!(positions(&db, None), [0, 1, 2]);
    assert!(children(&db, Some(&a)).is_empty());
    assert_eq!(fresh(&db, &c).parent_id, None);
}

#[test]
fn ciclos_sao_recusados_e_a_arvore_nao_muda() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", Some(&a));
    let c = page(&db, "C", Some(&b));

    assert!(
        matches!(mv(&db, &a, Some(&a), 0), Err(NotesError::Cycle)),
        "dentro de si mesma"
    );
    assert!(
        matches!(mv(&db, &a, Some(&b), 0), Err(NotesError::Cycle)),
        "dentro da filha"
    );
    assert!(
        matches!(mv(&db, &a, Some(&c), 0), Err(NotesError::Cycle)),
        "dentro da neta"
    );

    assert_eq!(children(&db, None), ids(&[&a]));
    assert_eq!(children(&db, Some(&a)), ids(&[&b]));
    assert_eq!(children(&db, Some(&b)), ids(&[&c]));
}

#[test]
fn mover_com_origem_ou_destino_invalidos_da_o_erro_certo() {
    let db = db();
    let a = page(&db, "A", None);
    let target = page(&db, "destino", None);
    let trashed = page(&db, "lixeira", None);
    service::delete(db.connection(), &trashed.id).unwrap();
    let ghost = Note {
        id: "fantasma".into(),
        ..page(&db, "x", None)
    };

    assert!(matches!(
        mv(&db, &a, Some(&trashed), 0),
        Err(NotesError::ParentInTrash)
    ));
    assert!(matches!(
        mv(&db, &a, Some(&ghost), 0),
        Err(NotesError::ParentNotFound)
    ));
    assert!(matches!(
        mv(&db, &trashed, Some(&target), 0),
        Err(NotesError::InTrash)
    ));
    assert!(matches!(
        mv(&db, &ghost, None, 0),
        Err(NotesError::NotFound)
    ));
}

#[test]
fn mover_nao_altera_a_versao_da_nota() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", None);

    let moved = mv(&db, &b, Some(&a), 0).unwrap();

    assert_eq!(
        moved.updated_at, b.updated_at,
        "organizar não é editar o conteúdo"
    );
}

// ───────── excluir ─────────

#[test]
fn excluir_leva_a_subarvore_junto_e_devolve_todos_os_ids_afetados() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", Some(&a));
    let c = page(&db, "C", Some(&b));
    let other = page(&db, "outra", None);

    let affected = service::delete(db.connection(), &a.id).unwrap();

    assert_eq!(sorted(affected), sorted(ids(&[&a, &b, &c])));
    assert_eq!(
        children(&db, None),
        ids(&[&other]),
        "só a 'outra' segue ativa"
    );
    let stamps: Vec<_> = [&a, &b, &c]
        .iter()
        .map(|n| fresh(&db, n).deleted_at)
        .collect();
    assert!(
        stamps[0].is_some() && stamps.iter().all(|s| *s == stamps[0]),
        "mesmo instante"
    );
}

#[test]
fn excluir_de_novo_e_idempotente_e_nao_afeta_ninguem() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", Some(&a));
    service::delete(db.connection(), &a.id).unwrap();
    let stamp = fresh(&db, &b).deleted_at;

    let again = service::delete(db.connection(), &a.id).unwrap();

    assert!(again.is_empty());
    assert_eq!(fresh(&db, &b).deleted_at, stamp, "nada foi re-carimbado");
}

#[test]
fn a_lixeira_mostra_so_a_raiz_e_conta_subpaginas_de_varios_niveis() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", Some(&a));
    page(&db, "C", Some(&b));
    page(&db, "D", Some(&a));

    service::delete(db.connection(), &a.id).unwrap();

    assert_eq!(trash_roots(&db), [(a.id, 3)]);
}

#[test]
fn exclusoes_em_ocasioes_diferentes_aparecem_como_raizes_separadas_na_lixeira() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", Some(&a));
    let c = page(&db, "C", Some(&b));
    service::delete(db.connection(), &c.id).unwrap(); // ocasião 1: só C
    service::delete(db.connection(), &b.id).unwrap(); // ocasião 2: B (C já estava lá)

    // C está debaixo de B, mas foi excluída em outra ocasião: é raiz própria, e B não a conta.
    assert_eq!(trash_roots(&db), [(b.id.clone(), 0), (c.id.clone(), 0)]);
}

// ───────── restaurar ─────────

#[test]
fn restaurar_a_raiz_traz_a_subarvore_de_volta_com_a_estrutura() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", Some(&a));
    let c = page(&db, "C", Some(&b));
    service::delete(db.connection(), &a.id).unwrap();

    let affected = service::restore(db.connection(), &a.id).unwrap();

    assert_eq!(sorted(affected), sorted(ids(&[&a, &b, &c])));
    assert_eq!(children(&db, None), ids(&[&a]));
    assert_eq!(children(&db, Some(&a)), ids(&[&b]));
    assert_eq!(children(&db, Some(&b)), ids(&[&c]));
    assert!(trash_roots(&db).is_empty());
}

#[test]
fn restaurar_nota_ja_ativa_e_idempotente() {
    let db = db();
    let a = page(&db, "A", None);

    assert!(service::restore(db.connection(), &a.id).unwrap().is_empty());
    assert!(matches!(
        service::restore(db.connection(), "nao-existe"),
        Err(NotesError::NotFound)
    ));
}

#[test]
fn descendente_excluida_antes_continua_na_lixeira_ao_restaurar_a_raiz() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", Some(&a));
    let c = page(&db, "C", Some(&b));
    service::delete(db.connection(), &c.id).unwrap(); // exclusão 1: só C
    service::delete(db.connection(), &a.id).unwrap(); // exclusão 2: A e B

    let affected = service::restore(db.connection(), &a.id).unwrap();

    assert_eq!(sorted(affected), sorted(ids(&[&a, &b])));
    assert!(
        fresh(&db, &c).deleted_at.is_some(),
        "C foi excluída por conta própria e segue na lixeira"
    );
    assert_eq!(trash_roots(&db), [(c.id.clone(), 0)]);
}

#[test]
fn restaurar_filha_cujo_pai_esta_na_lixeira_volta_para_a_raiz_com_sua_subarvore() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", Some(&a));
    let c = page(&db, "C", Some(&b));
    service::delete(db.connection(), &a.id).unwrap();

    let affected = service::restore(db.connection(), &b.id).unwrap();

    assert_eq!(sorted(affected), sorted(ids(&[&b, &c])));
    assert_eq!(children(&db, None), ids(&[&b]), "B voltou para a raiz");
    assert_eq!(
        children(&db, Some(&b)),
        ids(&[&c]),
        "e levou a sua subárvore"
    );
    assert!(fresh(&db, &a).deleted_at.is_some(), "A continua na lixeira");
    assert_eq!(
        trash_roots(&db),
        [(a.id.clone(), 0)],
        "e já não tem subpáginas na lixeira"
    );
}

#[test]
fn restaurar_com_pai_ativo_volta_para_o_mesmo_pai_no_fim_das_irmas() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", Some(&a));
    service::delete(db.connection(), &b.id).unwrap();
    let c = page(&db, "C", Some(&a)); // ocupa a posição que B tinha

    service::restore(db.connection(), &b.id).unwrap();

    assert_eq!(children(&db, Some(&a)), ids(&[&c, &b]));
    assert_eq!(positions(&db, Some(&a)), [0, 1]);
}

#[test]
fn instantes_de_exclusao_nunca_se_repetem_mesmo_em_exclusoes_seguidas() {
    // Se dois instantes caíssem no mesmo milissegundo, restaurar o pai confundiria a exclusão
    // anterior da filha com a do pai. Repete várias vezes para pegar a corrida.
    for _ in 0..50 {
        let db = db();
        let a = page(&db, "A", None);
        let c = page(&db, "C", Some(&a));
        service::delete(db.connection(), &c.id).unwrap();
        service::delete(db.connection(), &a.id).unwrap();

        service::restore(db.connection(), &a.id).unwrap();

        assert!(
            fresh(&db, &c).deleted_at.is_some(),
            "C não pode voltar junto com A"
        );
    }
}

// ───────── apagar de vez ─────────

#[test]
fn apagar_de_vez_leva_a_subarvore_e_devolve_os_ids() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", Some(&a));
    service::delete(db.connection(), &a.id).unwrap();

    let purged = service::purge(db.connection(), &a.id).unwrap();

    assert_eq!(sorted(purged), sorted(ids(&[&a, &b])));
    assert!(matches!(
        service::get(db.connection(), &a.id),
        Err(NotesError::NotFound)
    ));
    assert!(matches!(
        service::get(db.connection(), &b.id),
        Err(NotesError::NotFound)
    ));
}

#[test]
fn apagar_de_vez_exige_lixeira_e_nunca_apaga_pagina_ativa() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", Some(&a));

    assert!(matches!(
        service::purge(db.connection(), &a.id),
        Err(NotesError::NotInTrash)
    ));
    assert!(matches!(
        service::purge(db.connection(), "nao-existe"),
        Err(NotesError::NotFound)
    ));
    assert_eq!(children(&db, Some(&a)), ids(&[&b]), "nada foi apagado");
}

#[test]
fn apagar_de_vez_uma_descendente_leva_so_a_sua_propria_subarvore() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", Some(&a));
    let c = page(&db, "C", Some(&b));
    service::delete(db.connection(), &a.id).unwrap();

    let purged = service::purge(db.connection(), &b.id).unwrap();

    assert_eq!(sorted(purged), sorted(ids(&[&b, &c])));
    assert!(fresh(&db, &a).deleted_at.is_some(), "A continua na lixeira");
    assert_eq!(trash_roots(&db), [(a.id.clone(), 0)]);
}

// ───────── defesas do banco ─────────

#[test]
fn a_chave_estrangeira_e_a_rede_de_seguranca_contra_apagar_pagina_com_filhas() {
    let db = db();
    let a = page(&db, "A", None);
    page(&db, "B", Some(&a));

    let result = db
        .connection()
        .execute("DELETE FROM notes_note WHERE id = ?1", [&a.id]);

    assert!(
        result.is_err(),
        "o banco recusa apagar uma página que ainda tem filhas"
    );
}

#[test]
fn o_banco_recusa_pagina_mae_de_si_mesma_e_pai_inexistente() {
    let db = db();
    let a = page(&db, "A", None);

    let own_parent = db.connection().execute(
        "UPDATE notes_note SET parent_id = id WHERE id = ?1",
        [&a.id],
    );
    let ghost_parent = db.connection().execute(
        "UPDATE notes_note SET parent_id = 'nao-existe' WHERE id = ?1",
        [&a.id],
    );

    assert!(own_parent.is_err(), "CHECK");
    assert!(ghost_parent.is_err(), "chave estrangeira");
}

#[test]
fn fixar_funciona_em_subpaginas_sem_mudar_a_arvore() {
    let db = db();
    let a = page(&db, "A", None);
    let b = page(&db, "B", Some(&a));
    let c = page(&db, "C", Some(&a));

    let pinned = service::set_pinned(db.connection(), &c.id, true).unwrap();

    assert!(pinned.pinned);
    assert_eq!(children(&db, Some(&a)), ids(&[&b, &c]));
}
