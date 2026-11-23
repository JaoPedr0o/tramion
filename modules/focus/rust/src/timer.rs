//! O cronômetro do pomodoro em andamento, guardado em `focus_timer` (uma linha).
//!
//! Guardamos a HORA DE TÉRMINO (rodando) ou o restante (pausado), nunca uma contagem de ticks: ao reabrir o app, a
//! interface recalcula o que falta pelo relógio. Se o término já passou com o app fechado, [`finish`] registra a
//! sessão (com o início e a duração planejada, que de fato transcorreram) e deixa o cronômetro parado, tudo numa
//! transação e de forma idempotente (chamar de novo não registra outra sessão).

use crate::error::FocusError;
use crate::sessions::{self, Session};
use serde::{Deserialize, Serialize};
use tramion_infra_sqlite::rusqlite::{Connection, OptionalExtension, params};

const DURATION_MAX_MS: i64 = 86_400_000;
const NOTE_ID_MAX: usize = 100;
const CYCLE_MAX: i64 = 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Kind {
    Focus,
    Break,
    LongBreak,
}

impl Kind {
    fn as_str(self) -> &'static str {
        match self {
            Kind::Focus => "focus",
            Kind::Break => "break",
            Kind::LongBreak => "long-break",
        }
    }

    fn parse(text: &str) -> Option<Self> {
        match text {
            "focus" => Some(Kind::Focus),
            "break" => Some(Kind::Break),
            "long-break" => Some(Kind::LongBreak),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Phase {
    Idle,
    Running,
    Paused,
}

impl Phase {
    fn as_str(self) -> &'static str {
        match self {
            Phase::Idle => "idle",
            Phase::Running => "running",
            Phase::Paused => "paused",
        }
    }
}

/// O estado do cronômetro como a interface o vê (e o grava).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    pub phase: Phase,
    pub kind: Option<Kind>,
    /// Quando a sessão começou (ms desde 1970).
    pub started_at: Option<i64>,
    pub duration_ms: Option<i64>,
    /// Hora de término (só rodando).
    pub ends_at: Option<i64>,
    /// O que falta (só pausado).
    pub remaining_ms: Option<i64>,
    pub note_id: Option<String>,
    /// Sessões de foco concluídas no ciclo atual.
    pub cycle: i64,
}

impl TimerState {
    pub fn idle(cycle: i64) -> Self {
        Self {
            phase: Phase::Idle,
            kind: None,
            started_at: None,
            duration_ms: None,
            ends_at: None,
            remaining_ms: None,
            note_id: None,
            cycle,
        }
    }
}

/// O resultado de concluir o cronômetro.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Finish {
    /// A sessão de foco registrada agora (`None` se era pausa ou se já estava concluído).
    pub session: Option<Session>,
}

fn validate(state: &TimerState) -> Result<(), FocusError> {
    if !(0..=CYCLE_MAX).contains(&state.cycle) {
        return Err(FocusError::TimerInvalid);
    }
    let note_ok = state.note_id.as_deref().is_none_or(|id| {
        !id.trim().is_empty()
            && id.chars().count() <= NOTE_ID_MAX
            && !id.chars().any(char::is_control)
    });
    let ok = note_ok
        && match state.phase {
            Phase::Idle => {
                state.kind.is_none()
                    && state.started_at.is_none()
                    && state.duration_ms.is_none()
                    && state.ends_at.is_none()
                    && state.remaining_ms.is_none()
                    && state.note_id.is_none()
            }
            Phase::Running | Phase::Paused => {
                let duration = state.duration_ms.unwrap_or(0);
                let common = state.kind.is_some()
                    && state.started_at.is_some_and(|ms| ms > 0)
                    && (1000..=DURATION_MAX_MS).contains(&duration);
                if state.phase == Phase::Running {
                    common && state.ends_at.is_some_and(|ms| ms > 0) && state.remaining_ms.is_none()
                } else {
                    common
                        && state.ends_at.is_none()
                        && state
                            .remaining_ms
                            .is_some_and(|left| (0..=duration).contains(&left))
                }
            }
        };
    if ok {
        Ok(())
    } else {
        Err(FocusError::TimerInvalid)
    }
}

type Row = (
    String,
    Option<String>,
    Option<i64>,
    Option<i64>,
    Option<i64>,
    Option<i64>,
    Option<String>,
    i64,
);

/// O cronômetro guardado; sem linha (nunca usado), é um cronômetro parado.
pub fn get(conn: &Connection) -> Result<TimerState, FocusError> {
    let row: Option<Row> = conn
        .query_row(
            "SELECT phase, kind, started_at, duration_ms, ends_at, remaining_ms, note_id, cycle
             FROM focus_timer WHERE id = 1",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                ))
            },
        )
        .optional()?;
    let Some((phase, kind, started_at, duration_ms, ends_at, remaining_ms, note_id, cycle)) = row
    else {
        return Ok(TimerState::idle(0));
    };
    let phase = match phase.as_str() {
        "running" => Phase::Running,
        "paused" => Phase::Paused,
        _ => Phase::Idle,
    };
    Ok(TimerState {
        phase,
        kind: kind.as_deref().and_then(Kind::parse),
        started_at,
        duration_ms,
        ends_at,
        remaining_ms,
        note_id,
        cycle,
    })
}

fn write(conn: &Connection, state: &TimerState) -> Result<(), FocusError> {
    conn.execute(
        "INSERT INTO focus_timer
             (id, phase, kind, started_at, duration_ms, ends_at, remaining_ms, note_id, cycle)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT (id) DO UPDATE SET
             phase = excluded.phase, kind = excluded.kind, started_at = excluded.started_at,
             duration_ms = excluded.duration_ms, ends_at = excluded.ends_at,
             remaining_ms = excluded.remaining_ms, note_id = excluded.note_id, cycle = excluded.cycle,
             updated_at = CAST(unixepoch('subsec') * 1000 AS INTEGER)",
        params![
            state.phase.as_str(),
            state.kind.map(Kind::as_str),
            state.started_at,
            state.duration_ms,
            state.ends_at,
            state.remaining_ms,
            state.note_id.as_deref().map(str::trim),
            state.cycle,
        ],
    )?;
    Ok(())
}

/// Guarda o estado do cronômetro (iniciar, pausar, retomar, cancelar). Valida tudo.
pub fn set(conn: &Connection, state: &TimerState) -> Result<TimerState, FocusError> {
    validate(state)?;
    write(conn, state)?;
    get(conn)
}

/// Conclui o cronômetro que está RODANDO: se era foco, registra a sessão; deixa o cronômetro parado com o ciclo
/// informado. Uma transação só. Se não há cronômetro rodando (já concluído, cancelado), não faz nada.
pub fn finish(conn: &Connection, cycle: i64) -> Result<Finish, FocusError> {
    if !(0..=CYCLE_MAX).contains(&cycle) {
        return Err(FocusError::TimerInvalid);
    }
    let tx = conn.unchecked_transaction()?;
    let state = get(&tx)?;
    let mut session = None;
    if state.phase == Phase::Running {
        if let (Some(Kind::Focus), Some(started_at), Some(duration_ms)) =
            (state.kind, state.started_at, state.duration_ms)
        {
            session = Some(sessions::record(
                &tx,
                started_at,
                (duration_ms / 1000).max(1),
                state.note_id.clone(),
            )?);
        }
        write(&tx, &TimerState::idle(cycle))?;
    }
    tx.commit()?;
    Ok(Finish { session })
}
