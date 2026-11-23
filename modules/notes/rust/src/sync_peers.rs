//! Aparelhos pareados e o armazenamento real da sincronização (ADR 0020).

use crate::error::NotesError;
use crate::sync_io;
use serde::Serialize;
use std::sync::Mutex;
use tramion_infra_sqlite::rusqlite::{Connection, OptionalExtension, params};
use tramion_infra_sqlite::{Database, SharedDatabase};
use tramion_lan::pairing::{SECRET_LEN, secret_from_hex};
use tramion_lan::session::Store;
use tramion_sync::Record;

/// Máximo de aparelhos pareados.
pub const MAX_PEERS: usize = 10;

/// Um aparelho pareado, sem o segredo (que nunca vai para a interface).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    pub device: String,
    pub name: String,
    pub paired_at: i64,
    pub last_sync_at: Option<i64>,
    /// Este aparelho sabe onde procurá-lo (então "Sincronizar agora" o alcança).
    pub can_dial: bool,
}

pub fn list_peers(conn: &Connection) -> Result<Vec<Peer>, NotesError> {
    let mut stmt = conn
        .prepare("SELECT device, name, paired_at, last_sync_at, addrs <> '[]' FROM notes_sync_peer ORDER BY paired_at, device")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Peer {
                device: r.get(0)?,
                name: r.get(1)?,
                paired_at: r.get(2)?,
                last_sync_at: r.get(3)?,
                can_dial: r.get(4)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(rows)
}

/// Os segredos dos aparelhos pareados, na ordem de `list_peers`.
pub fn peer_secrets(conn: &Connection) -> Result<Vec<(String, [u8; SECRET_LEN])>, NotesError> {
    let mut stmt =
        conn.prepare("SELECT device, secret FROM notes_sync_peer ORDER BY paired_at, device")?;
    let rows: Vec<(String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    rows.into_iter()
        .map(|(device, secret)| {
            secret_from_hex(&secret)
                .map(|s| (device, s))
                .map_err(|e| NotesError::Internal(e.to_string()))
        })
        .collect()
}

/// Registra (ou renova o segredo de) um aparelho pareado.
pub fn add_peer(
    conn: &Connection,
    device: &str,
    name: &str,
    secret_hex: &str,
) -> Result<(), NotesError> {
    let known: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM notes_sync_peer WHERE device = ?1",
            [device],
            |r| r.get(0),
        )
        .optional()?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM notes_sync_peer", [], |r| r.get(0))?;
    if known.is_none() && count as usize >= MAX_PEERS {
        return Err(NotesError::LimitReached { max: MAX_PEERS });
    }
    conn.execute(
        "INSERT INTO notes_sync_peer (device, name, secret) VALUES (?1, ?2, ?3)
         ON CONFLICT (device) DO UPDATE SET secret = excluded.secret, name = excluded.name, base = '[]'",
        params![device, name, secret_hex],
    )?;
    Ok(())
}

/// Guarda o nome e os endereços de um aparelho pareado (o celular guarda onde achar o computador).
pub fn set_peer_info(
    conn: &Connection,
    device: &str,
    name: &str,
    addrs: &[String],
) -> Result<(), NotesError> {
    let json = serde_json::to_string(addrs).map_err(|e| NotesError::Internal(e.to_string()))?;
    conn.execute(
        "UPDATE notes_sync_peer SET name = ?2, addrs = ?3 WHERE device = ?1",
        params![device, name, json],
    )?;
    Ok(())
}

/// Um aparelho que este sabe procurar: id, segredo e endereços.
pub type DialablePeer = (String, [u8; SECRET_LEN], Vec<String>);

/// Aparelhos com endereço conhecido (os que este aparelho sabe procurar), com segredo e endereços.
pub fn dialable_peers(conn: &Connection) -> Result<Vec<DialablePeer>, NotesError> {
    let mut stmt = conn.prepare(
        "SELECT device, secret, addrs FROM notes_sync_peer WHERE addrs <> '[]' ORDER BY paired_at, device",
    )?;
    let rows: Vec<(String, String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<Result<_, _>>()?;
    rows.into_iter()
        .map(|(device, secret, addrs)| {
            let secret =
                secret_from_hex(&secret).map_err(|e| NotesError::Internal(e.to_string()))?;
            Ok((
                device,
                secret,
                serde_json::from_str(&addrs).unwrap_or_default(),
            ))
        })
        .collect()
}

/// Desfaz o pareamento: o aparelho nunca mais completa o aperto de mão com o segredo antigo.
pub fn remove_peer(conn: &Connection, device: &str) -> Result<bool, NotesError> {
    Ok(conn.execute("DELETE FROM notes_sync_peer WHERE device = ?1", [device])? > 0)
}

/// O armazenamento da sincronização sobre o banco do app. Cada chamada trava o banco só pelo tempo dela, para uma
/// sincronização lenta pela rede nunca congelar o app.
pub struct DbStore<'a> {
    db: &'a SharedDatabase,
}

impl<'a> DbStore<'a> {
    pub fn new(db: &'a SharedDatabase) -> Self {
        Self { db }
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Database>, String> {
        Mutex::lock(self.db).map_err(|_| "banco indisponível".to_string())
    }
}

impl Store for DbStore<'_> {
    fn device_id(&self) -> String {
        self.lock()
            .ok()
            .and_then(|db| sync_io::device_id(db.connection()).ok())
            .unwrap_or_default()
    }

    fn export(&mut self) -> Result<Vec<Record>, String> {
        sync_io::export_records(self.lock()?.connection()).map_err(|e| e.to_string())
    }

    fn apply(&mut self, records: &[Record]) -> Result<(), String> {
        sync_io::apply_records(self.lock()?.connection_mut(), records)
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    fn base(&mut self, peer: &str) -> Result<Vec<Record>, String> {
        let json: Option<String> = self
            .lock()?
            .connection()
            .query_row(
                "SELECT base FROM notes_sync_peer WHERE device = ?1",
                [peer],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        Ok(json
            .and_then(|j| serde_json::from_str(&j).ok())
            .unwrap_or_default())
    }

    fn rotate_secret(&mut self, peer: &str, secret_hex: &str) -> Result<(), String> {
        let short: String = peer.chars().take(4).collect();
        add_peer(
            self.lock()?.connection(),
            peer,
            &format!("Aparelho ({short})"),
            secret_hex,
        )
        .map_err(|e| e.to_string())
    }

    fn save_base(&mut self, peer: &str, records: &[Record]) -> Result<(), String> {
        let json = serde_json::to_string(records).map_err(|e| e.to_string())?;
        self.lock()?
            .connection()
            .execute(
                "UPDATE notes_sync_peer SET base = ?2, last_sync_at = CAST(unixepoch('subsec') * 1000 AS INTEGER)
                 WHERE device = ?1",
                params![peer, json],
            )
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}
