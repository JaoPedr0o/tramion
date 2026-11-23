//! Ajustes do pomodoro, guardados em `focus_setting` (chave e valor).

use crate::error::FocusError;
use serde::{Deserialize, Serialize};
use tramion_infra_sqlite::rusqlite::{Connection, params};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroSettings {
    /// Minutos de foco (1 a 180).
    pub focus_min: u32,
    /// Minutos da pausa curta (1 a 60).
    pub break_min: u32,
    /// Minutos da pausa longa (1 a 120).
    pub long_break_min: u32,
    /// A cada quantas sessões de foco vem a pausa longa (2 a 12); 0 = sem pausa longa.
    pub long_break_every: u32,
    /// Avisa com notificação do sistema ao fim. Desligado por padrão: só avisa quem pedir.
    pub notify: bool,
}

impl Default for PomodoroSettings {
    fn default() -> Self {
        Self {
            focus_min: 25,
            break_min: 5,
            long_break_min: 15,
            long_break_every: 0,
            notify: false,
        }
    }
}

fn validate(settings: &PomodoroSettings) -> Result<(), FocusError> {
    let ok = (1..=180).contains(&settings.focus_min)
        && (1..=60).contains(&settings.break_min)
        && (1..=120).contains(&settings.long_break_min)
        && (settings.long_break_every == 0 || (2..=12).contains(&settings.long_break_every));
    if ok {
        Ok(())
    } else {
        Err(FocusError::SettingsInvalid)
    }
}

fn read(conn: &Connection, key: &str) -> Result<Option<String>, FocusError> {
    let mut statement = conn.prepare("SELECT value FROM focus_setting WHERE key = ?1")?;
    let mut rows = statement.query([key])?;
    Ok(match rows.next()? {
        Some(row) => Some(row.get(0)?),
        None => None,
    })
}

/// Os ajustes atuais; o que nunca foi gravado (ou está corrompido) cai no padrão.
pub fn get(conn: &Connection) -> Result<PomodoroSettings, FocusError> {
    let defaults = PomodoroSettings::default();
    let number = |key: &str, fallback: u32| -> Result<u32, FocusError> {
        Ok(read(conn, key)?
            .and_then(|text| text.parse().ok())
            .unwrap_or(fallback))
    };
    let settings = PomodoroSettings {
        focus_min: number("focus_min", defaults.focus_min)?,
        break_min: number("break_min", defaults.break_min)?,
        long_break_min: number("long_break_min", defaults.long_break_min)?,
        long_break_every: number("long_break_every", defaults.long_break_every)?,
        notify: read(conn, "notify")?.is_some_and(|text| text == "1"),
    };
    // Valor gravado fora dos limites (banco editado à mão, versão futura): volta ao padrão inteiro.
    Ok(if validate(&settings).is_ok() {
        settings
    } else {
        defaults
    })
}

pub fn set(conn: &Connection, settings: &PomodoroSettings) -> Result<PomodoroSettings, FocusError> {
    validate(settings)?;
    let entries = [
        ("focus_min", settings.focus_min.to_string()),
        ("break_min", settings.break_min.to_string()),
        ("long_break_min", settings.long_break_min.to_string()),
        ("long_break_every", settings.long_break_every.to_string()),
        (
            "notify",
            if settings.notify { "1" } else { "0" }.to_string(),
        ),
    ];
    let tx = conn.unchecked_transaction()?;
    for (key, value) in entries {
        tx.execute(
            "INSERT INTO focus_setting (key, value) VALUES (?1, ?2)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value,
                 updated_at = CAST(unixepoch('subsec') * 1000 AS INTEGER)",
            params![key, value],
        )?;
    }
    tx.commit()?;
    get(conn)
}
