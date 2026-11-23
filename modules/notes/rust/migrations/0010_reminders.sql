-- Lembretes de tarefas por base: qual coluna de data vale, e quando a tarefa conta como concluída. A configuração
-- (JSON) some junto com a base.
CREATE TABLE notes_reminder (
    database_id TEXT NOT NULL PRIMARY KEY REFERENCES notes_database(note_id) ON DELETE CASCADE,
    config      TEXT NOT NULL CHECK (json_valid(config))
);
