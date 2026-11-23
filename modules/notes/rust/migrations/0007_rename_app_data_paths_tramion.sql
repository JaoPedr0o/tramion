-- O aplicativo passou a se chamar Tramion: a pasta de dados mudou de `dev.aesthetic.notes` para `dev.tramion.app`.
-- Imagens enviadas guardam o caminho completo no endereço, então os endereços da pasta anterior precisam apontar
-- para a nova (a migração 6 já levou os mais antigos, de `dev.aun.notes`, até `dev.aesthetic.notes`).
-- Sem efeito em quem nunca usou os nomes anteriores.
UPDATE notes_note
   SET content = replace(content, 'dev.aesthetic.notes', 'dev.tramion.app')
 WHERE content LIKE '%dev.aesthetic.notes%';

UPDATE notes_note
   SET cover = replace(cover, 'dev.aesthetic.notes', 'dev.tramion.app')
 WHERE cover LIKE '%dev.aesthetic.notes%';
