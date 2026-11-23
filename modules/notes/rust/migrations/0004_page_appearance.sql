-- Módulo de notas, migração 4: a aparência da página (símbolo e capa), como no Notion.
-- `icon` é um emoji (ou outro símbolo curto); `cover` descreve a capa em texto: `color:#rrggbb`,
-- `gradient:<nome>` (galeria) ou `image:<endereço>`. As regras de formato ficam no Rust; aqui só um limite
-- de tamanho como segunda defesa.
ALTER TABLE notes_note ADD COLUMN icon TEXT CHECK (icon IS NULL OR length(icon) BETWEEN 1 AND 32);
ALTER TABLE notes_note ADD COLUMN cover TEXT CHECK (cover IS NULL OR length(cover) <= 2100);
