-- Uma base de dados é uma página marcada; as linhas são as subpáginas dela. As colunas ("propriedades")
-- e os valores das células ficam em tabelas próprias, e somem junto com a página (ON DELETE CASCADE).
CREATE TABLE notes_database (
    note_id TEXT NOT NULL PRIMARY KEY REFERENCES notes_note(id) ON DELETE CASCADE
);

CREATE TABLE notes_property (
    id          TEXT    NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    database_id TEXT    NOT NULL REFERENCES notes_database(note_id) ON DELETE CASCADE,
    name        TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    kind        TEXT    NOT NULL CHECK (kind IN ('text', 'number', 'select', 'multi_select', 'date', 'checkbox', 'url')),
    options     TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(options)),
    position    INTEGER NOT NULL
);

CREATE INDEX notes_property_by_database ON notes_property (database_id, position);

CREATE TABLE notes_cell (
    note_id     TEXT NOT NULL REFERENCES notes_note(id) ON DELETE CASCADE,
    property_id TEXT NOT NULL REFERENCES notes_property(id) ON DELETE CASCADE,
    value       TEXT NOT NULL CHECK (json_valid(value)),
    PRIMARY KEY (note_id, property_id)
) WITHOUT ROWID;
