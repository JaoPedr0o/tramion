-- Módulo Foco, migração 1: hábitos, marcações do dia, sessões de pomodoro e ajustes.
-- Convenções (as mesmas do módulo de notas, para a sincronização futura): id de texto aleatório gerado pelo
-- SQLite e `updated_at` em milissegundos desde 1970 (UTC) em TODAS as tabelas.

CREATE TABLE focus_habit (
    id              TEXT    NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name            TEXT    NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 100),
    -- Um símbolo curto (emoji) opcional.
    icon            TEXT    CHECK (icon IS NULL OR length(icon) BETWEEN 1 AND 16),
    -- 'daily' = todo dia; 'weekdays' = segunda a sexta; 'weekly' = `times_per_week` vezes por semana.
    frequency       TEXT    NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekdays', 'weekly')),
    times_per_week  INTEGER CHECK (times_per_week IS NULL OR times_per_week BETWEEN 1 AND 7),
    -- Arquivamento reversível: NULL = ativo; preenchido = arquivado (o histórico fica).
    archived_at     INTEGER,
    created_at      INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    updated_at      INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    CHECK ((frequency = 'weekly') = (times_per_week IS NOT NULL))
);

-- Um dia marcado. `day` é a data LOCAL da pessoa (AAAA-MM-DD): o fuso é decidido por quem marca, e o dia não
-- "anda" se o aparelho mudar de fuso depois.
CREATE TABLE focus_habit_check (
    id         TEXT    NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    habit_id   TEXT    NOT NULL REFERENCES focus_habit (id) ON DELETE CASCADE,
    day        TEXT    NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    UNIQUE (habit_id, day)
);

CREATE INDEX focus_habit_check_day_idx ON focus_habit_check (day);

-- Uma sessão de foco concluída. `note_id` é só um id de texto (sem chave estrangeira): a página pode ser apagada
-- ou estar em outro módulo, e a sessão continua valendo.
CREATE TABLE focus_session (
    id           TEXT    NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    started_at   INTEGER NOT NULL CHECK (started_at > 0),
    duration_sec INTEGER NOT NULL CHECK (duration_sec BETWEEN 1 AND 86400),
    note_id      TEXT    CHECK (note_id IS NULL OR length(note_id) BETWEEN 1 AND 100),
    created_at   INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    updated_at   INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
);

CREATE INDEX focus_session_started_idx ON focus_session (started_at DESC);

-- Ajustes do módulo (chave e valor). Hoje: durações do pomodoro e se avisa ao fim.
CREATE TABLE focus_setting (
    key        TEXT    NOT NULL PRIMARY KEY,
    value      TEXT    NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
);
