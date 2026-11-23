-- Histórico de versões de cada página: instantâneos do estado ANTERIOR a uma edição, guardados no máximo de tempos em
-- tempos (a regra fica no código). Somem junto com a página (ON DELETE CASCADE).
CREATE TABLE notes_version (
    id         TEXT    NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    note_id    TEXT    NOT NULL REFERENCES notes_note(id) ON DELETE CASCADE,
    title      TEXT    NOT NULL,
    body       TEXT    NOT NULL,
    content    TEXT    NOT NULL CHECK (json_valid(content)),
    -- Quando esse estado foi salvo pela última vez (o `updated_at` da página naquele momento).
    saved_at   INTEGER NOT NULL,
    -- Quando o instantâneo foi guardado.
    created_at INTEGER NOT NULL
);

CREATE INDEX notes_version_by_note ON notes_version (note_id, created_at DESC);
