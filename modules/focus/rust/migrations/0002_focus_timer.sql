-- Módulo Foco, migração 2: o cronômetro do pomodoro em andamento, guardado para sobreviver ao app fechado.
-- Uma única linha (id = 1): `phase` diz se está parado, rodando (com a HORA DE TÉRMINO) ou pausado (com o restante).
-- `cycle` conta as sessões de foco concluídas no ciclo atual (para a pausa longa) e vale também com o cronômetro parado.

CREATE TABLE focus_timer (
    id           INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
    phase        TEXT    NOT NULL CHECK (phase IN ('idle', 'running', 'paused')),
    kind         TEXT    CHECK (kind IN ('focus', 'break', 'long-break')),
    started_at   INTEGER,
    duration_ms  INTEGER CHECK (duration_ms IS NULL OR duration_ms BETWEEN 1000 AND 86400000),
    ends_at      INTEGER,
    remaining_ms INTEGER CHECK (remaining_ms IS NULL OR remaining_ms >= 0),
    note_id      TEXT    CHECK (note_id IS NULL OR length(note_id) BETWEEN 1 AND 100),
    cycle        INTEGER NOT NULL DEFAULT 0 CHECK (cycle BETWEEN 0 AND 1000),
    updated_at   INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    CHECK (
        (phase = 'idle' AND kind IS NULL AND started_at IS NULL AND duration_ms IS NULL
            AND ends_at IS NULL AND remaining_ms IS NULL AND note_id IS NULL)
        OR (phase = 'running' AND kind IS NOT NULL AND started_at > 0 AND duration_ms IS NOT NULL
            AND ends_at > 0 AND remaining_ms IS NULL)
        OR (phase = 'paused' AND kind IS NOT NULL AND started_at > 0 AND duration_ms IS NOT NULL
            AND ends_at IS NULL AND remaining_ms IS NOT NULL)
    )
);
