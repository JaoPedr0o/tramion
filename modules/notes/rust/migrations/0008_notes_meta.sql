-- Pequenos marcadores do módulo (chave e valor). Por enquanto: se as páginas de exemplo já foram criadas, para que
-- nunca voltem depois que a pessoa apagar tudo.
CREATE TABLE notes_meta (
    key   TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
);
