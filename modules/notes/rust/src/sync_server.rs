//! O servidor de sincronização do computador (ADR 0020): escuta na rede local, aceita só quem tem um segredo
//! conhecido (aparelho já pareado ou QR aberto) e roda o encontro.

use crate::error::NotesError;
use crate::{sync_io, sync_peers};
use serde::Serialize;
use std::net::{IpAddr, TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};
use tramion_infra_sqlite::SharedDatabase;
use tramion_lan::LanError;
use tramion_lan::channel::SecureChannel;
use tramion_lan::pairing::{Pairing, new_secret, secret_from_hex, to_hex};
use tramion_lan::session::{Outcome, Store, run_responder};
use tramion_sync::Record;

/// Porta preferida; se estiver ocupada, o sistema escolhe outra (o QR sempre leva a porta certa).
pub const PREFERRED_PORT: u16 = 47653;
/// Quanto tempo um QR fica válido.
pub const PAIRING_TTL_MS: i64 = 5 * 60 * 1000;
/// Tempo máximo parado esperando a outra ponta numa conexão.
const IO_TIMEOUT: Duration = Duration::from_secs(30);

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

struct Pending {
    secret_hex: String,
    expires_at: i64,
}

/// O estado do servidor, guardado pelo app.
#[derive(Default)]
pub struct SyncState {
    pending: Mutex<Option<Pending>>,
    port: Mutex<Option<u16>>,
}

/// O que a tela de pareamento mostra.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingOffer {
    /// Texto do QR (também mostrado para digitar, se a câmera falhar).
    pub code: String,
    /// O QR como imagem SVG.
    pub svg: String,
    pub expires_at: i64,
}

impl SyncState {
    /// O segredo do QR aberto, se ainda não expirou. Um QR vencido é descartado aqui mesmo.
    fn live_pending(&self, now: i64) -> Option<String> {
        let mut guard = self.pending.lock().ok()?;
        match guard.as_ref() {
            Some(p) if p.expires_at > now => Some(p.secret_hex.clone()),
            Some(_) => {
                *guard = None;
                None
            }
            None => None,
        }
    }

    pub fn open_pairing(&self, now: i64) -> Result<(String, i64), NotesError> {
        let secret = to_hex(&new_secret().map_err(|e| NotesError::Internal(e.to_string()))?);
        let expires_at = now + PAIRING_TTL_MS;
        *self
            .pending
            .lock()
            .map_err(|_| NotesError::Internal("estado indisponível".into()))? = Some(Pending {
            secret_hex: secret.clone(),
            expires_at,
        });
        Ok((secret, expires_at))
    }

    pub fn cancel_pairing(&self) {
        if let Ok(mut guard) = self.pending.lock() {
            *guard = None;
        }
    }

    pub fn port(&self) -> Option<u16> {
        *self.port.lock().ok()?
    }
}

/// Endereços (IPv4 de rede local) onde o celular pode achar este computador.
pub fn local_addrs(port: u16) -> Vec<String> {
    let mut found: Vec<String> = local_ip_address::list_afinet_netifas()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|(_, ip)| match ip {
            IpAddr::V4(v4) if v4.is_private() && !v4.is_loopback() => Some(format!("{v4}:{port}")),
            _ => None,
        })
        .collect();
    found.sort();
    found.dedup();
    found.truncate(8);
    found
}

/// Monta a oferta de pareamento: código, QR e validade.
pub fn make_offer(code: &str, expires_at: i64) -> Result<PairingOffer, NotesError> {
    let svg = qrcode::QrCode::new(code.as_bytes())
        .map_err(|e| NotesError::Internal(e.to_string()))?
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(240, 240)
        .quiet_zone(true)
        .build();
    Ok(PairingOffer {
        code: code.to_string(),
        svg,
        expires_at,
    })
}

/// Um `Store` que, quando o aparelho entrou pelo QR, o registra como pareado assim que se identifica (antes da
/// mescla, para a base do encontro ter onde ser guardada).
struct PairingStore<'a> {
    inner: sync_peers::DbStore<'a>,
    db: &'a SharedDatabase,
    register: Option<String>,
}

impl Store for PairingStore<'_> {
    fn device_id(&self) -> String {
        self.inner.device_id()
    }
    fn export(&mut self) -> Result<Vec<Record>, String> {
        self.inner.export()
    }
    fn apply(&mut self, records: &[Record]) -> Result<(), String> {
        self.inner.apply(records)
    }
    fn base(&mut self, peer: &str) -> Result<Vec<Record>, String> {
        if let Some(secret) = self.register.take() {
            let short: String = peer.chars().take(4).collect();
            let db = self
                .db
                .lock()
                .map_err(|_| "banco indisponível".to_string())?;
            sync_peers::add_peer(
                db.connection(),
                peer,
                &format!("Celular ({short})"),
                &secret,
            )
            .map_err(|e| e.to_string())?;
        }
        self.inner.base(peer)
    }
    fn save_base(&mut self, peer: &str, records: &[Record]) -> Result<(), String> {
        self.inner.save_base(peer, records)
    }
    fn rotate_secret(&mut self, _peer: &str, _secret_hex: &str) -> Result<(), String> {
        Ok(()) // o computador já registrou o segredo definitivo em `base`
    }
}

/// Trata UMA conexão: escolhe o segredo, faz o aperto de mão e roda o encontro.
pub fn handle_connection(
    db: &SharedDatabase,
    state: &SyncState,
    stream: TcpStream,
) -> Result<Outcome, LanError> {
    let _ = stream.set_read_timeout(Some(IO_TIMEOUT));
    let _ = stream.set_write_timeout(Some(IO_TIMEOUT));

    let peers = {
        let guard = db
            .lock()
            .map_err(|_| LanError::Store("banco indisponível".into()))?;
        sync_peers::peer_secrets(guard.connection()).map_err(|e| LanError::Store(e.to_string()))?
    };
    let mut secrets: Vec<[u8; 32]> = peers.iter().map(|(_, s)| *s).collect();
    let pending = state.live_pending(now_ms());
    let pending_index = pending.as_ref().map(|hex| {
        secrets.push(secret_from_hex(hex).expect("gerado por nós"));
        secrets.len() - 1
    });

    let (mut channel, which) = SecureChannel::accept_any(stream, &secrets)?;
    let via_qr = pending_index == Some(which);
    // Pelo QR: gera o segredo definitivo, que vai ao celular pelo canal seguro; o do QR nunca é gravado.
    let definitive = if via_qr {
        Some(to_hex(
            &new_secret().map_err(|e| LanError::Crypto(e.to_string()))?,
        ))
    } else {
        None
    };
    let mut store = PairingStore {
        inner: sync_peers::DbStore::new(db),
        db,
        register: definitive.clone(),
    };
    let outcome = run_responder(&mut channel, &mut store, definitive.as_deref())?;
    if via_qr {
        state.cancel_pairing(); // cada QR vale para um único pareamento
    }
    Ok(outcome)
}

/// Garante que o servidor está escutando e devolve a porta. Idempotente.
pub fn ensure_running<R: Runtime>(app: &AppHandle<R>) -> Result<u16, NotesError> {
    let state = app.state::<SyncState>();
    let mut port = state
        .port
        .lock()
        .map_err(|_| NotesError::Internal("estado indisponível".into()))?;
    if let Some(p) = *port {
        return Ok(p);
    }
    let listener = TcpListener::bind(("0.0.0.0", PREFERRED_PORT))
        .or_else(|_| TcpListener::bind(("0.0.0.0", 0)))
        .map_err(|e| NotesError::Internal(format!("não foi possível escutar na rede: {e}")))?;
    let bound = listener
        .local_addr()
        .map_err(|e| NotesError::Internal(e.to_string()))?
        .port();
    *port = Some(bound);
    let app = app.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let db = app.state::<SharedDatabase>();
            let state = app.state::<SyncState>();
            if let Err(error) = handle_connection(&db, &state, stream) {
                eprintln!("[sync] conexão encerrada: {error}");
            }
        }
    });
    Ok(bound)
}

/// Chamada na abertura do app: se já há aparelhos pareados, o servidor sobe sozinho.
pub fn start_if_paired<R: Runtime>(app: &AppHandle<R>) {
    let paired = {
        let db = app.state::<SharedDatabase>();
        db.lock()
            .ok()
            .and_then(|g| sync_peers::list_peers(g.connection()).ok())
            .is_some_and(|peers| !peers.is_empty())
    };
    if paired && let Err(error) = ensure_running(app) {
        eprintln!("[sync] servidor não iniciou: {error}");
    }
}

/// Abre um pareamento novo: garante o servidor, gera o segredo e devolve o QR.
pub fn start_pairing<R: Runtime>(app: &AppHandle<R>) -> Result<PairingOffer, NotesError> {
    let port = ensure_running(app)?;
    let addrs = local_addrs(port);
    if addrs.is_empty() {
        return Err(NotesError::Internal(
            "sem conexão com uma rede local (Wi-Fi ou cabo)".into(),
        ));
    }
    let state = app.state::<SyncState>();
    let (secret, expires_at) = state.open_pairing(now_ms())?;
    let device = {
        let db = app.state::<SharedDatabase>();
        let guard = db
            .lock()
            .map_err(|_| NotesError::Internal("banco indisponível".into()))?;
        sync_io::device_id(guard.connection())?
    };
    let code = Pairing {
        device,
        secret,
        addrs,
    }
    .encode();
    make_offer(&code, expires_at)
}
