//! Testes do módulo Foco, com banco em memória e as migrações reais.

use tramion_focus::MIGRATIONS;
use tramion_focus::error::FocusError;
use tramion_focus::habits::{self, Frequency, HabitInput, is_valid_day};
use tramion_focus::sessions;
use tramion_focus::settings::{self, PomodoroSettings};

use tramion_infra_sqlite::Database;

fn db() -> Database {
    Database::open_in_memory(&[MIGRATIONS]).expect("as migrações reais devem aplicar")
}

fn daily(name: &str) -> HabitInput {
    HabitInput {
        name: name.to_string(),
        icon: None,
        frequency: Frequency::Daily,
        times_per_week: None,
    }
}

#[test]
fn todas_as_tabelas_tem_id_texto_e_updated_at_em_milissegundos() {
    let db = db();
    let c = db.connection();
    let habit = habits::create(c, daily("Ler")).unwrap();
    habits::set_check(c, &habit.id, "2026-11-20", true).unwrap();
    sessions::record(c, 1_700_000_000_000, 1500, None).unwrap();
    settings::set(c, &PomodoroSettings::default()).unwrap();

    for table in ["focus_habit", "focus_habit_check", "focus_session"] {
        let (id, updated): (String, i64) = c
            .query_row(&format!("SELECT id, updated_at FROM {table}"), [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(id.len(), 32, "{table}");
        assert!(updated > 1_700_000_000_000, "{table}: ms, não segundos");
    }
    let updated: i64 = c
        .query_row("SELECT min(updated_at) FROM focus_setting", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert!(updated > 1_700_000_000_000);
}

#[test]
fn cria_lista_e_edita_habito() {
    let db = db();
    let c = db.connection();
    let a = habits::create(
        c,
        HabitInput {
            name: "  Correr  ".into(),
            icon: Some(" 🏃 ".into()),
            frequency: Frequency::Weekly,
            times_per_week: Some(3),
        },
    )
    .unwrap();
    assert_eq!(a.name, "Correr");
    assert_eq!(a.icon.as_deref(), Some("🏃"));
    assert_eq!(a.times_per_week, Some(3));
    habits::create(c, daily("Ler")).unwrap();

    let names: Vec<_> = habits::list(c, false)
        .unwrap()
        .into_iter()
        .map(|h| h.name)
        .collect();
    assert_eq!(names, ["Correr", "Ler"]);

    let edited = habits::update(c, &a.id, daily("Caminhar")).unwrap();
    assert_eq!(edited.name, "Caminhar");
    assert_eq!(edited.frequency, Frequency::Daily);
    assert_eq!(
        edited.times_per_week, None,
        "N só vale na frequência semanal"
    );
    assert_eq!(edited.icon, None);
    assert!(edited.updated_at >= a.updated_at);
}

#[test]
fn valida_nome_icone_e_frequencia() {
    let db = db();
    let c = db.connection();
    assert!(matches!(
        habits::create(c, daily("   ")),
        Err(FocusError::NameInvalid)
    ));
    assert!(matches!(
        habits::create(c, daily(&"a".repeat(101))),
        Err(FocusError::NameInvalid)
    ));
    assert!(habits::create(c, daily(&"a".repeat(100))).is_ok());
    let mut bad_icon = daily("X");
    bad_icon.icon = Some("a\nb".into());
    assert!(matches!(
        habits::create(c, bad_icon),
        Err(FocusError::IconInvalid)
    ));
    for times in [None, Some(0), Some(8)] {
        let input = HabitInput {
            frequency: Frequency::Weekly,
            times_per_week: times,
            ..daily("X")
        };
        assert!(
            matches!(habits::create(c, input), Err(FocusError::FrequencyInvalid)),
            "{times:?}"
        );
    }
    assert!(matches!(
        habits::update(c, "inexistente", daily("X")),
        Err(FocusError::NotFound)
    ));
}

#[test]
fn arquivar_esconde_da_lista_mantem_historico_e_bloqueia_marcar() {
    let db = db();
    let c = db.connection();
    let h = habits::create(c, daily("Meditar")).unwrap();
    habits::set_check(c, &h.id, "2026-11-20", true).unwrap();

    let archived = habits::archive(c, &h.id, true).unwrap();
    assert!(archived.archived_at.is_some());
    assert!(habits::list(c, false).unwrap().is_empty());
    assert_eq!(habits::list(c, true).unwrap().len(), 1);
    assert!(matches!(
        habits::set_check(c, &h.id, "2026-11-21", true),
        Err(FocusError::Archived)
    ));
    assert_eq!(
        habits::checks(c, "2026-11-01", "2026-11-30").unwrap().len(),
        1,
        "o histórico fica"
    );

    let back = habits::archive(c, &h.id, false).unwrap();
    assert_eq!(back.archived_at, None);
    assert!(habits::set_check(c, &h.id, "2026-11-21", true).is_ok());
}

#[test]
fn marcar_e_desmarcar_e_idempotente() {
    let db = db();
    let c = db.connection();
    let h = habits::create(c, daily("Água")).unwrap();
    habits::set_check(c, &h.id, "2026-11-20", true).unwrap();
    habits::set_check(c, &h.id, "2026-11-20", true).unwrap();
    habits::set_check(c, &h.id, "2026-11-22", true).unwrap();
    assert_eq!(
        habits::checks(c, "2026-11-20", "2026-11-22").unwrap().len(),
        2
    );
    // O intervalo é inclusivo nas duas pontas e respeita a ordem.
    assert_eq!(
        habits::checks(c, "2026-11-21", "2026-11-22").unwrap().len(),
        1
    );

    habits::set_check(c, &h.id, "2026-11-20", false).unwrap();
    habits::set_check(c, &h.id, "2026-11-20", false).unwrap();
    let left = habits::checks(c, "2026-11-01", "2026-11-30").unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].day, "2026-11-22");
}

#[test]
fn marcar_valida_dia_e_habito() {
    let db = db();
    let c = db.connection();
    let h = habits::create(c, daily("Água")).unwrap();
    for day in [
        "2026-02-30",
        "2026-13-01",
        "26-11-20",
        "2026/11/20",
        "",
        "2026-11-2x",
    ] {
        assert!(
            matches!(
                habits::set_check(c, &h.id, day, true),
                Err(FocusError::DayInvalid)
            ),
            "{day}"
        );
    }
    assert!(matches!(
        habits::set_check(c, "nao-existe", "2026-11-20", true),
        Err(FocusError::NotFound)
    ));
    assert!(matches!(
        habits::checks(c, "2026-11-30", "2026-11-01"),
        Err(FocusError::DayInvalid)
    ));
}

#[test]
fn dias_validos_respeitam_bissexto() {
    assert!(is_valid_day("2028-02-29"));
    assert!(!is_valid_day("2027-02-29"));
    assert!(!is_valid_day("2100-02-29"));
    assert!(is_valid_day("2000-02-29"));
    assert!(is_valid_day("2026-12-31"));
    assert!(!is_valid_day("2026-04-31"));
    assert!(!is_valid_day("1999-12-31"));
    // Caracteres não ASCII não podem causar pânico ao fatiar o texto.
    assert!(!is_valid_day("20é6-11-20"));
}

#[test]
fn a_marcacao_some_com_o_habito_apagado_por_cascata() {
    let db = db();
    let c = db.connection();
    let h = habits::create(c, daily("Água")).unwrap();
    habits::set_check(c, &h.id, "2026-11-20", true).unwrap();
    c.execute("DELETE FROM focus_habit WHERE id = ?1", [&h.id])
        .unwrap();
    assert!(
        habits::checks(c, "2026-11-01", "2026-11-30")
            .unwrap()
            .is_empty()
    );
}

#[test]
fn registra_e_lista_sessoes() {
    let db = db();
    let c = db.connection();
    let first = sessions::record(c, 1_700_000_000_000, 1500, Some("pagina-1".into())).unwrap();
    assert_eq!(first.note_id.as_deref(), Some("pagina-1"));
    sessions::record(c, 1_700_000_100_000, 300, Some("  ".into())).unwrap();
    sessions::record(c, 1_700_000_200_000, 1500, None).unwrap();

    let all = sessions::list(c, None, None).unwrap();
    assert_eq!(all.len(), 3);
    assert_eq!(
        all[0].started_at, 1_700_000_200_000,
        "mais recente primeiro"
    );
    assert_eq!(all[1].note_id, None, "id em branco vira nenhum");

    assert_eq!(
        sessions::list(c, Some(1_700_000_100_000), None)
            .unwrap()
            .len(),
        2
    );
    assert_eq!(sessions::list(c, None, Some(1)).unwrap().len(), 1);
}

#[test]
fn recusa_sessao_invalida() {
    let db = db();
    let c = db.connection();
    for (start, dur) in [
        (0, 60),
        (-5, 60),
        (1_700_000_000_000, 0),
        (1_700_000_000_000, 86_401),
    ] {
        assert!(
            matches!(
                sessions::record(c, start, dur, None),
                Err(FocusError::SessionInvalid)
            ),
            "{start} {dur}"
        );
    }
    assert!(matches!(
        sessions::record(c, 1_700_000_000_000, 60, Some("x".repeat(101))),
        Err(FocusError::SessionInvalid)
    ));
    assert!(matches!(
        sessions::record(c, 1_700_000_000_000, 60, Some("a\u{0}b".into())),
        Err(FocusError::SessionInvalid)
    ));
    assert!(sessions::list(c, None, None).unwrap().is_empty());
}

#[test]
fn ajustes_tem_padrao_validacao_e_persistencia() {
    let db = db();
    let c = db.connection();
    let defaults = settings::get(c).unwrap();
    assert_eq!(
        (
            defaults.focus_min,
            defaults.break_min,
            defaults.long_break_every
        ),
        (25, 5, 0)
    );
    assert!(!defaults.notify, "notificação só se a pessoa ligar");
    assert!(defaults.sound, "o sino ao fim vem ligado");

    let custom = PomodoroSettings {
        focus_min: 50,
        break_min: 10,
        long_break_min: 30,
        long_break_every: 4,
        notify: true,
        sound: false,
    };
    assert_eq!(settings::set(c, &custom).unwrap(), custom);
    assert_eq!(settings::get(c).unwrap(), custom);

    for bad in [
        PomodoroSettings {
            focus_min: 0,
            ..custom.clone()
        },
        PomodoroSettings {
            focus_min: 181,
            ..custom.clone()
        },
        PomodoroSettings {
            break_min: 61,
            ..custom.clone()
        },
        PomodoroSettings {
            long_break_min: 0,
            ..custom.clone()
        },
        PomodoroSettings {
            long_break_every: 1,
            ..custom.clone()
        },
        PomodoroSettings {
            long_break_every: 13,
            ..custom.clone()
        },
    ] {
        assert!(matches!(
            settings::set(c, &bad),
            Err(FocusError::SettingsInvalid)
        ));
    }
    assert_eq!(settings::get(c).unwrap(), custom, "inválido não grava nada");
}

#[test]
fn ajuste_corrompido_no_banco_volta_ao_padrao() {
    let db = db();
    let c = db.connection();
    c.execute(
        "INSERT INTO focus_setting (key, value) VALUES ('focus_min', 'abc'), ('break_min', '9999')",
        [],
    )
    .unwrap();
    assert_eq!(settings::get(c).unwrap(), PomodoroSettings::default());
}

#[test]
fn banco_do_foco_convive_com_outros_modulos_e_reabre_sem_erro() {
    // Abrir de novo com as mesmas migrações (idempotência do controle de versão do módulo).
    let dir = std::env::temp_dir().join(format!("focus-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("t.db");
    let options = tramion_infra_sqlite::OpenOptions {
        backup_dir: None,
        backups_to_keep: 0,
    };
    {
        let db = Database::open(&path, &[MIGRATIONS], &options).unwrap();
        habits::create(db.connection(), daily("Ler")).unwrap();
    }
    let db = Database::open(&path, &[MIGRATIONS], &options).unwrap();
    assert_eq!(habits::list(db.connection(), false).unwrap().len(), 1);
    std::fs::remove_dir_all(&dir).ok();
}
