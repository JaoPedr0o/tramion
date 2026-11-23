//! Testes dos lembretes de tarefas.

use serde_json::{Value, json};
use tramion_infra_sqlite::Database;
use tramion_notes::MIGRATIONS;
use tramion_notes::database::{self, due_tasks, set_reminders};
use tramion_notes::duplicate::duplicate;
use tramion_notes::error::NotesError;
use tramion_notes::model::{NewNote, Note};
use tramion_notes::service;

const TODAY: &str = "2026-11-15";

fn db() -> Database {
    Database::open_in_memory(&[MIGRATIONS]).expect("as migrações reais devem aplicar")
}

struct Tasks {
    base: Note,
    date: String,
    done_box: String,
    status: String,
}

/// Base "Tarefas" com colunas Prazo (data), Feita (caixa) e Status (seleção com a opção "feito").
fn tasks(db: &Database, title: &str) -> Tasks {
    let base = database::create_database(db.connection(), title, None).unwrap();
    let c = db.connection();
    let date = database::add_property(c, &base.id, "Prazo", "date")
        .unwrap()
        .id;
    let done_box = database::add_property(c, &base.id, "Feita", "checkbox")
        .unwrap()
        .id;
    let status = database::add_property(c, &base.id, "Status", "select")
        .unwrap()
        .id;
    database::update_property(
        c,
        &status,
        None,
        Some(&json!([
            { "id": "fazer", "name": "A fazer", "color": "gray" },
            { "id": "feito", "name": "Feito", "color": "green" }
        ])),
    )
    .unwrap();
    Tasks {
        base,
        date,
        done_box,
        status,
    }
}

fn row(db: &Database, t: &Tasks, title: &str, date: Option<&str>) -> String {
    let row = database::create_row(db.connection(), &t.base.id, title).unwrap();
    if let Some(date) = date {
        database::set_cell(db.connection(), &row.id, &t.date, &json!(date)).unwrap();
    }
    row.id
}

fn on(db: &Database, t: &Tasks) {
    set_reminders(
        db.connection(),
        &t.base.id,
        Some(&json!({ "enabled": true, "dateProperty": t.date, "doneProperty": t.done_box })),
    )
    .unwrap();
}

fn titles(db: &Database) -> Vec<String> {
    due_tasks(db.connection(), TODAY)
        .unwrap()
        .into_iter()
        .map(|t| t.title)
        .collect()
}

fn code<T: std::fmt::Debug>(result: Result<T, NotesError>) -> &'static str {
    result.expect_err("era para falhar").code()
}

#[test]
fn sem_lembretes_ligados_nao_ha_tarefas() {
    let db = db();
    let t = tasks(&db, "Tarefas");
    row(&db, &t, "Atrasada", Some("2026-11-01"));

    assert!(titles(&db).is_empty());
}

#[test]
fn atrasadas_e_de_hoje_aparecem_futuras_e_sem_data_nao() {
    let db = db();
    let t = tasks(&db, "Tarefas");
    row(&db, &t, "Atrasada", Some("2026-11-10"));
    row(&db, &t, "Hoje", Some(TODAY));
    row(&db, &t, "Amanhã", Some("2026-11-16"));
    row(&db, &t, "Sem data", None);
    on(&db, &t);

    let due = due_tasks(db.connection(), TODAY).unwrap();

    assert_eq!(
        due.iter().map(|d| d.title.as_str()).collect::<Vec<_>>(),
        ["Atrasada", "Hoje"]
    );
    assert!(due[0].overdue);
    assert!(!due[1].overdue);
    assert_eq!(due[0].database_title, "Tarefas");
    assert_eq!(due[0].date, "2026-11-10");
}

#[test]
fn caixa_marcada_conta_como_concluida_desmarcada_nao() {
    let db = db();
    let t = tasks(&db, "Tarefas");
    let feita = row(&db, &t, "Feita", Some(TODAY));
    let aberta = row(&db, &t, "Aberta", Some(TODAY));
    let sem_caixa = row(&db, &t, "Sem caixa", Some(TODAY));
    database::set_cell(db.connection(), &feita, &t.done_box, &json!(true)).unwrap();
    database::set_cell(db.connection(), &aberta, &t.done_box, &json!(false)).unwrap();
    on(&db, &t);
    let _ = sem_caixa;

    assert_eq!(titles(&db), ["Aberta", "Sem caixa"]);
}

#[test]
fn selecao_com_opcao_de_concluida() {
    let db = db();
    let t = tasks(&db, "Tarefas");
    let feita = row(&db, &t, "Feita", Some(TODAY));
    let andamento = row(&db, &t, "Em andamento", Some(TODAY));
    database::set_cell(db.connection(), &feita, &t.status, &json!("feito")).unwrap();
    database::set_cell(db.connection(), &andamento, &t.status, &json!("fazer")).unwrap();
    set_reminders(
        db.connection(),
        &t.base.id,
        Some(&json!({
            "enabled": true,
            "dateProperty": t.date,
            "doneProperty": t.status,
            "doneOption": "feito"
        })),
    )
    .unwrap();

    assert_eq!(titles(&db), ["Em andamento"]);
}

#[test]
fn sem_coluna_de_conclusao_toda_tarefa_com_prazo_vencido_conta() {
    let db = db();
    let t = tasks(&db, "Tarefas");
    row(&db, &t, "A", Some("2026-11-01"));
    set_reminders(
        db.connection(),
        &t.base.id,
        Some(&json!({ "enabled": true, "dateProperty": t.date })),
    )
    .unwrap();

    assert_eq!(titles(&db), ["A"]);
}

#[test]
fn desligado_linha_apagada_e_base_na_lixeira_nao_contam() {
    let db = db();
    let t = tasks(&db, "Tarefas");
    let apagada = row(&db, &t, "Apagada", Some("2026-11-01"));
    row(&db, &t, "Fica", Some("2026-11-01"));
    on(&db, &t);
    service::delete(db.connection(), &apagada).unwrap();
    assert_eq!(titles(&db), ["Fica"]);

    set_reminders(
        db.connection(),
        &t.base.id,
        Some(&json!({ "enabled": false, "dateProperty": t.date })),
    )
    .unwrap();
    assert!(titles(&db).is_empty());

    on(&db, &t);
    service::delete(db.connection(), &t.base.id).unwrap();
    assert!(titles(&db).is_empty(), "base na lixeira não avisa");
    service::restore(db.connection(), &t.base.id).unwrap();
    assert_eq!(titles(&db), ["Fica"]);
}

#[test]
fn varias_bases_ordenadas_por_prazo_e_depois_por_titulo() {
    let db = db();
    let a = tasks(&db, "Casa");
    let b = tasks(&db, "Trabalho");
    row(&db, &a, "Lavar", Some("2026-11-12"));
    row(&db, &a, "Cozinhar", Some(TODAY));
    row(&db, &b, "Relatório", Some("2026-11-12"));
    row(&db, &b, "Apresentar", Some(TODAY));
    on(&db, &a);
    on(&db, &b);

    assert_eq!(
        titles(&db),
        ["Lavar", "Relatório", "Apresentar", "Cozinhar"]
    );
}

#[test]
fn data_de_hoje_invalida_e_recusada() {
    let db = db();

    for today in ["", "15/11/2026", "2026-13-01", "2026-02-30", "hoje"] {
        assert_eq!(
            code(due_tasks(db.connection(), today)),
            "notes.cell-invalid",
            "{today}"
        );
    }
}

#[test]
fn configuracao_invalida_e_recusada() {
    let db = db();
    let t = tasks(&db, "Tarefas");
    let other = tasks(&db, "Outra");
    let bad = [
        json!("texto"),
        json!({}),
        json!({ "enabled": "sim", "dateProperty": t.date }),
        json!({ "enabled": true }),
        json!({ "enabled": true, "dateProperty": "nao-existe" }),
        json!({ "enabled": true, "dateProperty": t.done_box }),
        json!({ "enabled": true, "dateProperty": other.date }),
        json!({ "enabled": true, "dateProperty": t.date, "doneProperty": other.done_box }),
        json!({ "enabled": true, "dateProperty": t.date, "doneProperty": t.date }),
        json!({ "enabled": true, "dateProperty": t.date, "doneProperty": t.status }),
        json!({ "enabled": true, "dateProperty": t.date, "doneProperty": t.status, "doneOption": "zzz" }),
        json!({ "enabled": true, "dateProperty": 7 }),
    ];
    for config in bad {
        assert_eq!(
            code(set_reminders(db.connection(), &t.base.id, Some(&config))),
            "notes.property-invalid",
            "deveria recusar: {config}"
        );
    }
}

#[test]
fn a_configuracao_e_limpa_e_volta_em_get_database_e_null_desliga() {
    let db = db();
    let t = tasks(&db, "Tarefas");

    let saved = set_reminders(
        db.connection(),
        &t.base.id,
        Some(&json!({ "enabled": true, "dateProperty": t.date, "doneProperty": t.done_box, "lixo": 1 })),
    )
    .unwrap()
    .unwrap();

    assert_eq!(saved["doneOption"], Value::Null);
    assert!(saved.get("lixo").is_none());
    let data = database::get_database(db.connection(), &t.base.id).unwrap();
    assert_eq!(data.reminders, Some(saved));

    assert_eq!(
        set_reminders(db.connection(), &t.base.id, None).unwrap(),
        None
    );
    assert_eq!(
        database::get_database(db.connection(), &t.base.id)
            .unwrap()
            .reminders,
        None
    );
}

#[test]
fn so_bases_ativas_aceitam_lembretes() {
    let db = db();
    let page = service::create(
        db.connection(),
        NewNote {
            title: "P".into(),
            body: String::new(),
            parent_id: None,
        },
    )
    .unwrap();
    let t = tasks(&db, "Tarefas");
    let config = json!({ "enabled": true, "dateProperty": t.date });

    assert_eq!(
        code(set_reminders(db.connection(), &page.id, Some(&config))),
        "notes.not-database"
    );
    service::delete(db.connection(), &t.base.id).unwrap();
    assert_eq!(
        code(set_reminders(db.connection(), &t.base.id, Some(&config))),
        "notes.in-trash"
    );
}

#[test]
fn apagar_a_coluna_de_data_deixa_de_avisar_sem_quebrar() {
    let db = db();
    let t = tasks(&db, "Tarefas");
    row(&db, &t, "A", Some("2026-11-01"));
    on(&db, &t);

    database::delete_property(db.connection(), &t.date).unwrap();

    assert!(titles(&db).is_empty());
}

#[test]
fn apagar_a_base_de_vez_leva_a_configuracao_e_duplicar_copia_com_as_colunas_novas() {
    let db = db();
    let t = tasks(&db, "Tarefas");
    on(&db, &t);

    let ids = duplicate(db.connection(), &t.base.id).unwrap();
    let copy = database::get_database(db.connection(), &ids[0]).unwrap();
    let config = copy.reminders.expect("a cópia mantém os lembretes");
    let new_date = copy.properties.iter().find(|p| p.kind == "date").unwrap();
    assert_eq!(config["dateProperty"], json!(new_date.id));
    assert_ne!(config["dateProperty"], json!(t.date));

    service::delete(db.connection(), &t.base.id).unwrap();
    service::purge(db.connection(), &t.base.id).unwrap();
    let count: i64 = db
        .connection()
        .query_row("SELECT COUNT(*) FROM notes_reminder", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1, "só sobrou a da cópia");
}
