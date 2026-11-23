-- Endereços onde achar o aparelho pareado (`ip:porta`, em JSON). Só o celular os usa: é ele quem conecta ao computador.
ALTER TABLE notes_sync_peer ADD COLUMN addrs TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(addrs));
