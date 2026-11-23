//! Testes do cronômetro persistido, com banco em memória e as migrações reais.

use tramion_focus::MIGRATIONS;
use tramion_focus::error::FocusError;
use tramion_focus::sessions;
use tramion_focus::timer::{self, Kind, Phase, TimerState};
use tramion_infra_sqlite::Database;

fn db() -> Database {
    Database::open_in_memory(&[MIGRATIONS]).expect("as migrações reais devem aplicar")
}

fn running(kind: Kind, started_at: i64, duration_ms: i64) -> TimerState {
    TimerState {
        phase: Phase::Running,
        kind: Some(kind),
        started_at: Some(started_at),
        duration_ms: Some(duration_ms),
        ends_at: Some(started_at + duration_ms),
        remaining_ms: None,
        note_id: None,
        cycle: 0,
    }
}

#[test]
fn cronometro_sem_uso_esta_parado_e_guarda_o_que_roda_e_o_que_pausa() {
    let db = db();
    let c = db.connection();
    assert_eq!(timer::get(c).unwrap(), TimerState::idle(0));

    let mut state = running(Kind::Focus, 1_700_000_000_000, 1_500_000);
    state.note_id = Some("pagina-1".into());
    state.cycle = 2;
    assert_eq!(timer::set(c, &state).unwrap(), state);
    assert_eq!(timer::get(c).unwrap(), state);

    let paused = TimerState {
        phase: Phase::Paused,
        ends_at: None,
        remaining_ms: Some(600_000),
        ..state.clone()
    };
    assert_eq!(timer::set(c, &paused).unwrap(), paused);

    let idle = TimerState::idle(2);
    assert_eq!(timer::set(c, &idle).unwrap(), idle);
    let rows: i64 = c
        .query_row("SELECT count(*) FROM focus_timer", [], |r| r.get(0))
        .unwrap();
    assert_eq!(rows, 1, "uma linha só");
}

#[test]
fn cronometro_incoerente_e_recusado() {
    let db = db();
    let c = db.connection();
    let ok = running(Kind::Focus, 1_700_000_000_000, 1_500_000);
    for bad in [
        TimerState {
            ends_at: None,
            ..ok.clone()
        },
        TimerState {
            remaining_ms: Some(1),
            ..ok.clone()
        },
        TimerState {
            duration_ms: Some(10),
            ..ok.clone()
        },
        TimerState {
            started_at: Some(0),
            ..ok.clone()
        },
        TimerState {
            kind: None,
            ..ok.clone()
        },
        TimerState {
            cycle: -1,
            ..ok.clone()
        },
        TimerState {
            phase: Phase::Paused,
            ends_at: None,
            remaining_ms: Some(2_000_000),
            ..ok.clone()
        },
        TimerState {
            phase: Phase::Idle,
            ..ok.clone()
        },
        TimerState {
            note_id: Some("  ".into()),
            ..ok.clone()
        },
    ] {
        assert!(
            matches!(timer::set(c, &bad), Err(FocusError::TimerInvalid)),
            "{bad:?}"
        );
    }
    assert_eq!(timer::get(c).unwrap(), TimerState::idle(0));
}

#[test]
fn concluir_o_foco_registra_a_sessao_uma_unica_vez_e_para_o_cronometro() {
    let db = db();
    let c = db.connection();
    let mut state = running(Kind::Focus, 1_700_000_000_000, 1_500_000);
    state.note_id = Some("pagina-9".into());
    timer::set(c, &state).unwrap();

    let done = timer::finish(c, 1).unwrap();
    let session = done.session.expect("o foco concluído vira sessão");
    assert_eq!(session.started_at, 1_700_000_000_000);
    assert_eq!(session.duration_sec, 1500);
    assert_eq!(session.note_id.as_deref(), Some("pagina-9"));
    assert_eq!(timer::get(c).unwrap(), TimerState::idle(1));

    // Chamar de novo (outro caminho, outra abertura do app) não duplica.
    assert!(timer::finish(c, 1).unwrap().session.is_none());
    assert_eq!(sessions::list(c, None, None).unwrap().len(), 1);
}

#[test]
fn concluir_pausa_ou_cronometro_pausado_nao_registra_sessao() {
    let db = db();
    let c = db.connection();
    timer::set(c, &running(Kind::Break, 1_700_000_000_000, 300_000)).unwrap();
    assert!(timer::finish(c, 1).unwrap().session.is_none());
    assert_eq!(timer::get(c).unwrap(), TimerState::idle(1));

    let paused = TimerState {
        phase: Phase::Paused,
        ends_at: None,
        remaining_ms: Some(60_000),
        ..running(Kind::Focus, 1_700_000_000_000, 1_500_000)
    };
    timer::set(c, &paused).unwrap();
    assert!(timer::finish(c, 5).unwrap().session.is_none());
    assert_eq!(
        timer::get(c).unwrap(),
        paused,
        "pausado não conclui sozinho"
    );
    assert!(sessions::list(c, None, None).unwrap().is_empty());
    assert!(matches!(
        timer::finish(c, 5000),
        Err(FocusError::TimerInvalid)
    ));
}
