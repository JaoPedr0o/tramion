-- Estado de sincronização (ADR 0020, fase 1): para cada registro sincronizável, a hora da última mudança, o aparelho
-- que a fez e se foi apagado (lápide). É mantido por gatilhos, então nenhum código de escrita precisa lembrar dele.
-- Mudanças vindas de outro aparelho ligam `sync_applying` em notes_meta e gravam o estado delas mesmas.

CREATE TABLE notes_sync_state (
    kind       TEXT    NOT NULL,
    id         TEXT    NOT NULL,
    updated_at INTEGER NOT NULL,
    device     TEXT    NOT NULL,
    deleted    INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
    PRIMARY KEY (kind, id)
) WITHOUT ROWID;

CREATE TRIGGER notes_note_sync_insert AFTER INSERT ON notes_note
WHEN (SELECT value FROM notes_meta WHERE key = 'sync_applying') IS NOT '1'
BEGIN
    INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
    VALUES ('note', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER), COALESCE((SELECT value FROM notes_meta WHERE key = 'device_id'), 'local'), 0)
    ON CONFLICT (kind, id) DO UPDATE SET updated_at = excluded.updated_at, device = excluded.device, deleted = excluded.deleted;
END;

CREATE TRIGGER notes_note_sync_update AFTER UPDATE ON notes_note
WHEN (SELECT value FROM notes_meta WHERE key = 'sync_applying') IS NOT '1'
BEGIN
    INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
    VALUES ('note', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER), COALESCE((SELECT value FROM notes_meta WHERE key = 'device_id'), 'local'), 0)
    ON CONFLICT (kind, id) DO UPDATE SET updated_at = excluded.updated_at, device = excluded.device, deleted = excluded.deleted;
END;

CREATE TRIGGER notes_note_sync_delete AFTER DELETE ON notes_note
WHEN (SELECT value FROM notes_meta WHERE key = 'sync_applying') IS NOT '1'
BEGIN
    INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
    VALUES ('note', OLD.id, CAST(unixepoch('subsec') * 1000 AS INTEGER), COALESCE((SELECT value FROM notes_meta WHERE key = 'device_id'), 'local'), 1)
    ON CONFLICT (kind, id) DO UPDATE SET updated_at = excluded.updated_at, device = excluded.device, deleted = excluded.deleted;
END;

CREATE TRIGGER notes_property_sync_insert AFTER INSERT ON notes_property
WHEN (SELECT value FROM notes_meta WHERE key = 'sync_applying') IS NOT '1'
BEGIN
    INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
    VALUES ('property', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER), COALESCE((SELECT value FROM notes_meta WHERE key = 'device_id'), 'local'), 0)
    ON CONFLICT (kind, id) DO UPDATE SET updated_at = excluded.updated_at, device = excluded.device, deleted = excluded.deleted;
END;

CREATE TRIGGER notes_property_sync_update AFTER UPDATE ON notes_property
WHEN (SELECT value FROM notes_meta WHERE key = 'sync_applying') IS NOT '1'
BEGIN
    INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
    VALUES ('property', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER), COALESCE((SELECT value FROM notes_meta WHERE key = 'device_id'), 'local'), 0)
    ON CONFLICT (kind, id) DO UPDATE SET updated_at = excluded.updated_at, device = excluded.device, deleted = excluded.deleted;
END;

CREATE TRIGGER notes_property_sync_delete AFTER DELETE ON notes_property
WHEN (SELECT value FROM notes_meta WHERE key = 'sync_applying') IS NOT '1'
BEGIN
    INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
    VALUES ('property', OLD.id, CAST(unixepoch('subsec') * 1000 AS INTEGER), COALESCE((SELECT value FROM notes_meta WHERE key = 'device_id'), 'local'), 1)
    ON CONFLICT (kind, id) DO UPDATE SET updated_at = excluded.updated_at, device = excluded.device, deleted = excluded.deleted;
END;

CREATE TRIGGER notes_cell_sync_insert AFTER INSERT ON notes_cell
WHEN (SELECT value FROM notes_meta WHERE key = 'sync_applying') IS NOT '1'
BEGIN
    INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
    VALUES ('cell', NEW.note_id || ':' || NEW.property_id, CAST(unixepoch('subsec') * 1000 AS INTEGER), COALESCE((SELECT value FROM notes_meta WHERE key = 'device_id'), 'local'), 0)
    ON CONFLICT (kind, id) DO UPDATE SET updated_at = excluded.updated_at, device = excluded.device, deleted = excluded.deleted;
END;

CREATE TRIGGER notes_cell_sync_update AFTER UPDATE ON notes_cell
WHEN (SELECT value FROM notes_meta WHERE key = 'sync_applying') IS NOT '1'
BEGIN
    INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
    VALUES ('cell', NEW.note_id || ':' || NEW.property_id, CAST(unixepoch('subsec') * 1000 AS INTEGER), COALESCE((SELECT value FROM notes_meta WHERE key = 'device_id'), 'local'), 0)
    ON CONFLICT (kind, id) DO UPDATE SET updated_at = excluded.updated_at, device = excluded.device, deleted = excluded.deleted;
END;

CREATE TRIGGER notes_cell_sync_delete AFTER DELETE ON notes_cell
WHEN (SELECT value FROM notes_meta WHERE key = 'sync_applying') IS NOT '1'
BEGIN
    INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
    VALUES ('cell', OLD.note_id || ':' || OLD.property_id, CAST(unixepoch('subsec') * 1000 AS INTEGER), COALESCE((SELECT value FROM notes_meta WHERE key = 'device_id'), 'local'), 1)
    ON CONFLICT (kind, id) DO UPDATE SET updated_at = excluded.updated_at, device = excluded.device, deleted = excluded.deleted;
END;

CREATE TRIGGER notes_view_sync_insert AFTER INSERT ON notes_view
WHEN (SELECT value FROM notes_meta WHERE key = 'sync_applying') IS NOT '1'
BEGIN
    INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
    VALUES ('view', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER), COALESCE((SELECT value FROM notes_meta WHERE key = 'device_id'), 'local'), 0)
    ON CONFLICT (kind, id) DO UPDATE SET updated_at = excluded.updated_at, device = excluded.device, deleted = excluded.deleted;
END;

CREATE TRIGGER notes_view_sync_update AFTER UPDATE ON notes_view
WHEN (SELECT value FROM notes_meta WHERE key = 'sync_applying') IS NOT '1'
BEGIN
    INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
    VALUES ('view', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER), COALESCE((SELECT value FROM notes_meta WHERE key = 'device_id'), 'local'), 0)
    ON CONFLICT (kind, id) DO UPDATE SET updated_at = excluded.updated_at, device = excluded.device, deleted = excluded.deleted;
END;

CREATE TRIGGER notes_view_sync_delete AFTER DELETE ON notes_view
WHEN (SELECT value FROM notes_meta WHERE key = 'sync_applying') IS NOT '1'
BEGIN
    INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
    VALUES ('view', OLD.id, CAST(unixepoch('subsec') * 1000 AS INTEGER), COALESCE((SELECT value FROM notes_meta WHERE key = 'device_id'), 'local'), 1)
    ON CONFLICT (kind, id) DO UPDATE SET updated_at = excluded.updated_at, device = excluded.device, deleted = excluded.deleted;
END;

CREATE TRIGGER notes_user_template_sync_insert AFTER INSERT ON notes_user_template
WHEN (SELECT value FROM notes_meta WHERE key = 'sync_applying') IS NOT '1'
BEGIN
    INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
    VALUES ('template', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER), COALESCE((SELECT value FROM notes_meta WHERE key = 'device_id'), 'local'), 0)
    ON CONFLICT (kind, id) DO UPDATE SET updated_at = excluded.updated_at, device = excluded.device, deleted = excluded.deleted;
END;

CREATE TRIGGER notes_user_template_sync_update AFTER UPDATE ON notes_user_template
WHEN (SELECT value FROM notes_meta WHERE key = 'sync_applying') IS NOT '1'
BEGIN
    INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
    VALUES ('template', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER), COALESCE((SELECT value FROM notes_meta WHERE key = 'device_id'), 'local'), 0)
    ON CONFLICT (kind, id) DO UPDATE SET updated_at = excluded.updated_at, device = excluded.device, deleted = excluded.deleted;
END;

CREATE TRIGGER notes_user_template_sync_delete AFTER DELETE ON notes_user_template
WHEN (SELECT value FROM notes_meta WHERE key = 'sync_applying') IS NOT '1'
BEGIN
    INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
    VALUES ('template', OLD.id, CAST(unixepoch('subsec') * 1000 AS INTEGER), COALESCE((SELECT value FROM notes_meta WHERE key = 'device_id'), 'local'), 1)
    ON CONFLICT (kind, id) DO UPDATE SET updated_at = excluded.updated_at, device = excluded.device, deleted = excluded.deleted;
END;

-- Registros que já existiam entram como se tivessem sido editados agora, neste aparelho.
INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
SELECT 'note', id, CAST(unixepoch('subsec') * 1000 AS INTEGER), 'local', 0 FROM notes_note;
INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
SELECT 'property', id, CAST(unixepoch('subsec') * 1000 AS INTEGER), 'local', 0 FROM notes_property;
INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
SELECT 'cell', note_id || ':' || property_id, CAST(unixepoch('subsec') * 1000 AS INTEGER), 'local', 0 FROM notes_cell;
INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
SELECT 'view', id, CAST(unixepoch('subsec') * 1000 AS INTEGER), 'local', 0 FROM notes_view;
INSERT INTO notes_sync_state (kind, id, updated_at, device, deleted)
SELECT 'template', id, CAST(unixepoch('subsec') * 1000 AS INTEGER), 'local', 0 FROM notes_user_template;
