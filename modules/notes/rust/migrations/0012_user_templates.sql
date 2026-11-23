-- Modelos de página criados pela pessoa ("Salvar como modelo"): uma cópia do texto, do símbolo e do nome, sem ligação
-- com a página de origem.
CREATE TABLE notes_user_template (
    id         TEXT    NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name       TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    icon       TEXT    NOT NULL,
    body       TEXT    NOT NULL,
    content    TEXT    NOT NULL CHECK (json_valid(content)),
    created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
);
