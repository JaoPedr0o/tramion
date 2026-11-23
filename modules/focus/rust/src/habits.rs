//! Hábitos e suas marcações por dia. O Rust é dono da validação; a sequência (streak) é calculada na interface
//! por uma função pura, a partir das marcações devolvidas aqui.

use crate::error::FocusError;
use serde::{Deserialize, Serialize};
use tramion_infra_sqlite::rusqlite::{Connection, OptionalExtension, Row, params};

const NOW_MS: &str = "CAST(unixepoch('subsec') * 1000 AS INTEGER)";
const NAME_MAX: usize = 100;
const ICON_MAX: usize = 16;

/// Com que frequência o hábito é esperado.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Frequency {
    /// Todo dia.
    Daily,
    /// Segunda a sexta.
    Weekdays,
    /// N vezes por semana, em quaisquer dias.
    Weekly,
}

impl Frequency {
    fn as_str(self) -> &'static str {
        match self {
            Frequency::Daily => "daily",
            Frequency::Weekdays => "weekdays",
            Frequency::Weekly => "weekly",
        }
    }

    fn parse(text: &str) -> Option<Self> {
        match text {
            "daily" => Some(Frequency::Daily),
            "weekdays" => Some(Frequency::Weekdays),
            "weekly" => Some(Frequency::Weekly),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Habit {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub frequency: Frequency,
    /// Só preenchido na frequência semanal (1 a 7).
    pub times_per_week: Option<u8>,
    /// `None` = ativo; preenchido = arquivado.
    pub archived_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Os dados editáveis de um hábito.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitInput {
    pub name: String,
    pub icon: Option<String>,
    pub frequency: Frequency,
    pub times_per_week: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitCheck {
    pub habit_id: String,
    /// Data local (AAAA-MM-DD).
    pub day: String,
}

/// Dados já validados, prontos para gravar.
struct Clean {
    name: String,
    icon: Option<String>,
    frequency: Frequency,
    times_per_week: Option<u8>,
}

fn clean(input: HabitInput) -> Result<Clean, FocusError> {
    let name = input.name.trim().to_string();
    if name.is_empty() || name.chars().count() > NAME_MAX {
        return Err(FocusError::NameInvalid);
    }
    let icon = match input.icon.map(|icon| icon.trim().to_string()) {
        None => None,
        Some(icon) if icon.is_empty() => None,
        Some(icon) => {
            if icon.chars().count() > ICON_MAX || icon.chars().any(char::is_control) {
                return Err(FocusError::IconInvalid);
            }
            Some(icon)
        }
    };
    let times_per_week = match (input.frequency, input.times_per_week) {
        (Frequency::Weekly, Some(n)) if (1..=7).contains(&n) => Some(n),
        (Frequency::Weekly, _) => return Err(FocusError::FrequencyInvalid),
        // Fora da frequência semanal o número não tem sentido: é descartado.
        (_, _) => None,
    };
    Ok(Clean {
        name,
        icon,
        frequency: input.frequency,
        times_per_week,
    })
}

/// `AAAA-MM-DD` de um dia que existe no calendário (ano de 2000 a 2100).
pub fn is_valid_day(day: &str) -> bool {
    let bytes = day.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let number = |range: std::ops::Range<usize>| -> Option<u32> {
        let part = &day[range];
        if part.bytes().all(|b| b.is_ascii_digit()) {
            part.parse().ok()
        } else {
            None
        }
    };
    let (Some(year), Some(month), Some(date)) = (number(0..4), number(5..7), number(8..10)) else {
        return false;
    };
    if !(2000..=2100).contains(&year) || !(1..=12).contains(&month) {
        return false;
    }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let last = match month {
        2 if leap => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    (1..=last).contains(&date)
}

const COLUMNS: &str =
    "id, name, icon, frequency, times_per_week, archived_at, created_at, updated_at";

fn from_row(row: &Row<'_>) -> Result<Habit, tramion_infra_sqlite::rusqlite::Error> {
    let frequency: String = row.get(3)?;
    Ok(Habit {
        id: row.get(0)?,
        name: row.get(1)?,
        icon: row.get(2)?,
        frequency: Frequency::parse(&frequency).unwrap_or(Frequency::Daily),
        times_per_week: row.get(4)?,
        archived_at: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

pub fn get(conn: &Connection, id: &str) -> Result<Habit, FocusError> {
    conn.query_row(
        &format!("SELECT {COLUMNS} FROM focus_habit WHERE id = ?1"),
        [id],
        from_row,
    )
    .optional()?
    .ok_or(FocusError::NotFound)
}

/// Lista os hábitos, na ordem de criação. Os arquivados só vêm se pedidos.
pub fn list(conn: &Connection, include_archived: bool) -> Result<Vec<Habit>, FocusError> {
    let filter = if include_archived {
        ""
    } else {
        "WHERE archived_at IS NULL"
    };
    let mut statement = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM focus_habit {filter} ORDER BY created_at, rowid"
    ))?;
    let habits = statement
        .query_map([], from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(habits)
}

pub fn create(conn: &Connection, input: HabitInput) -> Result<Habit, FocusError> {
    let data = clean(input)?;
    let id: String = conn.query_row(
        "INSERT INTO focus_habit (name, icon, frequency, times_per_week) VALUES (?1, ?2, ?3, ?4) RETURNING id",
        params![
            data.name,
            data.icon,
            data.frequency.as_str(),
            data.times_per_week
        ],
        |row| row.get(0),
    )?;
    get(conn, &id)
}

pub fn update(conn: &Connection, id: &str, input: HabitInput) -> Result<Habit, FocusError> {
    let data = clean(input)?;
    let changed = conn.execute(
        &format!(
            "UPDATE focus_habit SET name = ?2, icon = ?3, frequency = ?4, times_per_week = ?5, updated_at = {NOW_MS} WHERE id = ?1"
        ),
        params![
            id,
            data.name,
            data.icon,
            data.frequency.as_str(),
            data.times_per_week
        ],
    )?;
    if changed == 0 {
        return Err(FocusError::NotFound);
    }
    get(conn, id)
}

/// Arquiva (ou desarquiva) o hábito. O histórico de marcações é mantido.
pub fn archive(conn: &Connection, id: &str, archived: bool) -> Result<Habit, FocusError> {
    let changed = conn.execute(
        &format!(
            "UPDATE focus_habit SET archived_at = CASE WHEN ?2 THEN COALESCE(archived_at, {NOW_MS}) ELSE NULL END, updated_at = {NOW_MS} WHERE id = ?1"
        ),
        params![id, archived],
    )?;
    if changed == 0 {
        return Err(FocusError::NotFound);
    }
    get(conn, id)
}

/// As marcações de todos os hábitos entre duas datas (inclusive), em ordem de dia.
pub fn checks(conn: &Connection, from: &str, to: &str) -> Result<Vec<HabitCheck>, FocusError> {
    // AAAA-MM-DD ordena como texto na mesma ordem do calendário.
    if !is_valid_day(from) || !is_valid_day(to) || from > to {
        return Err(FocusError::DayInvalid);
    }
    let mut statement = conn.prepare(
        "SELECT habit_id, day FROM focus_habit_check WHERE day BETWEEN ?1 AND ?2 ORDER BY day, habit_id",
    )?;
    let rows = statement
        .query_map([from, to], |row| {
            Ok(HabitCheck {
                habit_id: row.get(0)?,
                day: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Marca ou desmarca um dia. Repetir a mesma chamada não muda nada (idempotente).
pub fn set_check(
    conn: &Connection,
    habit_id: &str,
    day: &str,
    done: bool,
) -> Result<(), FocusError> {
    if !is_valid_day(day) {
        return Err(FocusError::DayInvalid);
    }
    let habit = get(conn, habit_id)?;
    if habit.archived_at.is_some() {
        return Err(FocusError::Archived);
    }
    if done {
        conn.execute(
            "INSERT OR IGNORE INTO focus_habit_check (habit_id, day) VALUES (?1, ?2)",
            params![habit_id, day],
        )?;
    } else {
        conn.execute(
            "DELETE FROM focus_habit_check WHERE habit_id = ?1 AND day = ?2",
            params![habit_id, day],
        )?;
    }
    Ok(())
}
