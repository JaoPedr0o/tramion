-- Módulo de notas, migração 3: o conteúdo da página em BLOCOS.
-- `content` guarda a lista de blocos do editor (JSON). `body` continua existindo como o texto simples
-- da página (espelho gerado pela interface), reservado para a busca. Páginas já existentes ficam com
-- `content = '[]'` e são convertidas pela interface na primeira vez que forem abertas.
ALTER TABLE notes_note ADD COLUMN content TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(content));
