-- Módulo de notas, migração 2: páginas dentro de páginas (hierarquia) e ordem entre irmãs.
-- A migração 1 não é tocada: ela já foi aplicada e o checksum a protege.

-- Quem é a página-mãe (NULL = está na raiz). A chave estrangeira é a rede de segurança: o banco
-- recusa apagar uma página que ainda tem filhas. O CHECK impede uma página de ser mãe de si mesma
-- (os ciclos maiores são barrados pelas regras em Rust).
ALTER TABLE notes_note ADD COLUMN parent_id TEXT REFERENCES notes_note(id)
    CHECK (parent_id IS NULL OR parent_id <> id);

-- Posição entre as irmãs (0, 1, 2...). É renumerada a cada inserção ou movimento.
ALTER TABLE notes_note ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- Páginas que já existem ficam na raiz, na ordem que a lista já mostrava: mais recentes primeiro.
UPDATE notes_note SET position = (
    SELECT COUNT(*) FROM notes_note other
     WHERE other.deleted_at IS NULL
       AND (other.updated_at > notes_note.updated_at
            OR (other.updated_at = notes_note.updated_at AND other.id < notes_note.id))
);

-- O índice da migração 1 (fixadas e recentes) deixa de servir: a ordem agora é por posição.
DROP INDEX notes_note_active_idx;
CREATE INDEX notes_note_tree_idx ON notes_note (parent_id, position) WHERE deleted_at IS NULL;
