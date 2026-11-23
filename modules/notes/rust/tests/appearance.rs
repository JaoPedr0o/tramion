//! Testes do símbolo (emoji) e da capa das páginas.

use aun_infra_sqlite::Database;
use aun_notes::MIGRATIONS;
use aun_notes::error::NotesError;
use aun_notes::model::{NewNote, Note};
use aun_notes::service::{self, validate_cover, validate_icon};

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

#[test]
fn pagina_nova_nao_tem_simbolo_nem_capa() {
    let note = page(&db());

    assert_eq!((note.icon, note.cover), (None, None));
}

#[test]
fn define_o_simbolo_e_a_capa_e_a_listagem_mostra_o_simbolo() {
    let db = db();
    let note = page(&db);

    let updated = service::set_appearance(
        db.connection(),
        &note.id,
        Some("🚀"),
        Some("gradient:aurora"),
    )
    .unwrap();

    assert_eq!(updated.icon.as_deref(), Some("🚀"));
    assert_eq!(updated.cover.as_deref(), Some("gradient:aurora"));
    let listed = service::list(db.connection()).unwrap();
    assert_eq!(
        listed[0].icon.as_deref(),
        Some("🚀"),
        "a árvore precisa do símbolo"
    );
    let read = service::get(db.connection(), &note.id).unwrap();
    assert_eq!(read.cover.as_deref(), Some("gradient:aurora"));
}

#[test]
fn limpar_remove_o_simbolo_e_a_capa() {
    let db = db();
    let note = page(&db);
    service::set_appearance(db.connection(), &note.id, Some("🚀"), Some("color:#112233")).unwrap();

    let cleared = service::set_appearance(db.connection(), &note.id, None, None).unwrap();

    assert_eq!((cleared.icon, cleared.cover), (None, None));
}

#[test]
fn a_aparencia_nao_altera_a_versao_da_pagina() {
    let db = db();
    let note = page(&db);

    let updated = service::set_appearance(db.connection(), &note.id, Some("📘"), None).unwrap();

    assert_eq!(
        updated.updated_at, note.updated_at,
        "aparência não é conteúdo: não causa conflito"
    );
}

#[test]
fn recusado_nao_altera_nada() {
    let db = db();
    let note = page(&db);
    service::set_appearance(
        db.connection(),
        &note.id,
        Some("🚀"),
        Some("gradient:aurora"),
    )
    .unwrap();

    assert!(matches!(
        service::set_appearance(db.connection(), &note.id, Some("   "), None),
        Err(NotesError::IconInvalid)
    ));
    assert!(matches!(
        service::set_appearance(db.connection(), &note.id, None, Some("javascript:alert(1)")),
        Err(NotesError::CoverInvalid)
    ));

    let unchanged = service::get(db.connection(), &note.id).unwrap();
    assert_eq!(unchanged.icon.as_deref(), Some("🚀"));
    assert_eq!(unchanged.cover.as_deref(), Some("gradient:aurora"));
}

#[test]
fn pagina_inexistente_ou_na_lixeira_da_o_erro_certo() {
    let db = db();
    assert!(matches!(
        service::set_appearance(db.connection(), "nao-existe", Some("🚀"), None),
        Err(NotesError::NotFound)
    ));

    let note = page(&db);
    service::delete(db.connection(), &note.id).unwrap();
    assert!(matches!(
        service::set_appearance(db.connection(), &note.id, Some("🚀"), None),
        Err(NotesError::InTrash)
    ));
}

#[test]
fn simbolos_validos_e_invalidos() {
    for ok in ["🚀", "📘", "👨‍👩‍👧‍👦", "🇧🇷", "A", " 🚀 "] {
        assert!(validate_icon(ok).is_ok(), "{ok:?}");
    }
    assert_eq!(
        validate_icon(" 🚀 ").unwrap(),
        "🚀",
        "espaços das pontas saem"
    );
    for bad in ["", "   ", "\n", "a\u{0}b", "🚀\u{7}", &"x".repeat(17)] {
        assert!(
            matches!(validate_icon(bad), Err(NotesError::IconInvalid)),
            "{bad:?}"
        );
    }
}

#[test]
fn capas_validas() {
    for ok in [
        "color:#aabbcc",
        "color:#AABBCC",
        "gradient:aurora",
        "gradient:por-do-sol-2",
        "image:https://exemplo.com/foto.jpg",
        "image:http://exemplo.com/foto.png?x=1&y=2",
        "image:asset://localhost/%2Fdados%2Fassets%2Fabc.png",
        "image:http://asset.localhost/abc.png",
    ] {
        assert!(validate_cover(ok).is_ok(), "{ok:?}");
    }
}

#[test]
fn capas_invalidas_incluindo_tentativas_de_injecao_no_estilo() {
    let long_url = format!("image:https://exemplo.com/{}", "a".repeat(2000));
    for bad in [
        "",
        "color:#abc",
        "color:#gggggg",
        "color:red",
        "color:#aabbcc; background: url(x)",
        "gradient:",
        "gradient:Aurora",
        "gradient:com espaço",
        "gradient:a;b",
        "image:",
        "image:javascript:alert(1)",
        "image:file:///etc/passwd",
        "image:data:image/png;base64,AAAA",
        "image:ftp://exemplo.com/a.png",
        "image:https://exemplo.com/a b.png",
        "image:https://exemplo.com/a\".png",
        "image:https://exemplo.com/a').png",
        "image:https://exemplo.com/a)x(.png",
        "image:https://exemplo.com/a\\b.png",
        "image:https://exemplo.com/<script>",
        "url(https://exemplo.com/a.png)",
        "https://exemplo.com/a.png",
        long_url.as_str(),
    ] {
        assert!(
            matches!(validate_cover(bad), Err(NotesError::CoverInvalid)),
            "deveria recusar {bad:?}"
        );
    }
}

#[test]
fn codigos_de_erro_sao_estaveis() {
    assert_eq!(NotesError::IconInvalid.code(), "notes.icon-invalid");
    assert_eq!(NotesError::CoverInvalid.code(), "notes.cover-invalid");
}
