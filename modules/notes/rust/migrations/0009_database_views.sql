-- Visões salvas de uma base: cada visão tem um nome e uma configuração (forma de exibição, filtros, ordenação,
-- coluna de agrupamento ou de data...) em JSON. Toda base tem pelo menos uma visão; as bases que já existiam ganham
-- uma visão "Tabela".
CREATE TABLE notes_view (
    id          TEXT    NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    database_id TEXT    NOT NULL REFERENCES notes_database(note_id) ON DELETE CASCADE,
    name        TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    config      TEXT    NOT NULL CHECK (json_valid(config)),
    position    INTEGER NOT NULL
);

CREATE INDEX notes_view_by_database ON notes_view (database_id, position);

INSERT INTO notes_view (database_id, name, config, position)
SELECT note_id, 'Tabela', '{"mode":"table","filters":[],"sort":null}', 0 FROM notes_database;
