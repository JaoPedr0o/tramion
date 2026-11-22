-- Módulo de notas, migração 1: a tabela principal.
-- Atenção: depois de aplicada em algum banco, esta migração NÃO pode mais ser editada
-- (o checksum impede). Mudanças viram uma migração nova (0002, 0003...).

CREATE TABLE notes_note (
    -- Gerado pelo SQLite: 32 caracteres hexadecimais aleatórios.
    id         TEXT    NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    title      TEXT    NOT NULL CHECK (length(trim(title)) > 0 AND length(title) <= 200),
    body       TEXT    NOT NULL DEFAULT '',
    pinned     INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    -- Milissegundos desde 1970 (UTC).
    created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    -- Exclusão reversível: NULL = ativa; preenchido = na lixeira.
    deleted_at INTEGER
);

-- Acelera a listagem principal: fixadas primeiro, depois as mais recentes, só as ativas.
CREATE INDEX notes_note_active_idx
    ON notes_note (pinned DESC, updated_at DESC)
    WHERE deleted_at IS NULL;
