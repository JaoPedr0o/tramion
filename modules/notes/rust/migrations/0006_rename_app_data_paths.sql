-- O aplicativo passou de "Aesthetic Ugly Notes" para "Aesthetic Notes": a pasta de dados mudou de
-- `dev.aun.notes` para `dev.aesthetic.notes`. Imagens enviadas são guardadas com o caminho completo no endereço,
-- então os endereços antigos precisam apontar para a pasta nova. Sem efeito em quem nunca usou o nome antigo.
UPDATE notes_note
   SET content = replace(content, 'dev.aun.notes', 'dev.aesthetic.notes')
 WHERE content LIKE '%dev.aun.notes%';

UPDATE notes_note
   SET cover = replace(cover, 'dev.aun.notes', 'dev.aesthetic.notes')
 WHERE cover LIKE '%dev.aun.notes%';
