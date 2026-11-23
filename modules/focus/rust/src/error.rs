use std::fmt;
use tramion_infra_sqlite::rusqlite;

/// O que pode dar errado no módulo Foco. Cada variante tem um [`code`](FocusError::code) estável, que a
/// interface usa para escolher a mensagem; o texto de `Display` é técnico, para logs.
#[derive(Debug)]
pub enum FocusError {
    /// Nome do hábito vazio ou longo demais.
    NameInvalid,
    /// Símbolo do hábito inválido.
    IconInvalid,
    /// Frequência desconhecida ou número de vezes por semana fora de 1 a 7.
    FrequencyInvalid,
    /// Data que não é um dia válido no formato AAAA-MM-DD (ou intervalo invertido).
    DayInvalid,
    /// O hábito não existe.
    NotFound,
    /// O hábito está arquivado: não aceita novas marcações.
    Archived,
    /// Sessão com início ou duração fora do aceitável, ou página associada inválida.
    SessionInvalid,
    /// Ajustes do pomodoro fora dos limites.
    SettingsInvalid,
    /// Estado do cronômetro incoerente (fase, horas ou ciclo fora do aceitável).
    TimerInvalid,
    Storage(rusqlite::Error),
    Internal(String),
}

impl FocusError {
    pub fn code(&self) -> &'static str {
        match self {
            FocusError::NameInvalid => "focus.name-invalid",
            FocusError::IconInvalid => "focus.icon-invalid",
            FocusError::FrequencyInvalid => "focus.frequency-invalid",
            FocusError::DayInvalid => "focus.day-invalid",
            FocusError::NotFound => "focus.not-found",
            FocusError::Archived => "focus.archived",
            FocusError::SessionInvalid => "focus.session-invalid",
            FocusError::SettingsInvalid => "focus.settings-invalid",
            FocusError::TimerInvalid => "focus.timer-invalid",
            FocusError::Storage(_) | FocusError::Internal(_) => "focus.internal",
        }
    }
}

impl fmt::Display for FocusError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FocusError::NameInvalid => write!(f, "o nome do hábito deve ter de 1 a 100 caracteres"),
            FocusError::IconInvalid => write!(f, "o símbolo do hábito não é válido"),
            FocusError::FrequencyInvalid => write!(f, "a frequência do hábito não é válida"),
            FocusError::DayInvalid => write!(f, "a data deve ser um dia válido (AAAA-MM-DD)"),
            FocusError::NotFound => write!(f, "hábito não encontrado"),
            FocusError::Archived => write!(f, "o hábito está arquivado"),
            FocusError::SessionInvalid => write!(f, "a sessão não é válida"),
            FocusError::SettingsInvalid => write!(f, "os ajustes estão fora dos limites"),
            FocusError::TimerInvalid => write!(f, "o estado do cronômetro não é válido"),
            FocusError::Storage(error) => write!(f, "erro de armazenamento: {error}"),
            FocusError::Internal(message) => write!(f, "erro interno: {message}"),
        }
    }
}

impl std::error::Error for FocusError {}

impl From<rusqlite::Error> for FocusError {
    fn from(error: rusqlite::Error) -> Self {
        FocusError::Storage(error)
    }
}
