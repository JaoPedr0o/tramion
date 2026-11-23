-- Aparelhos pareados (ADR 0020). `secret` é o segredo compartilhado do pareamento (hexadecimal) e `base` é o estado
-- de ambos no último encontro, usado para distinguir edição de um lado só de conflito.
CREATE TABLE notes_sync_peer (
    device       TEXT    NOT NULL PRIMARY KEY CHECK (length(device) BETWEEN 1 AND 64),
    name         TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    secret       TEXT    NOT NULL CHECK (length(secret) = 64),
    base         TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(base)),
    paired_at    INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    last_sync_at INTEGER
);
