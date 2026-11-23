//! O lado de quem conecta (o celular): parear com o código do QR e sincronizar com os computadores pareados.

use crate::error::NotesError;
use crate::sync_peers::{self, DbStore};
use serde::Serialize;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::Duration;
use tramion_infra_sqlite::SharedDatabase;
use tramion_lan::LanError;
use tramion_lan::channel::SecureChannel;
use tramion_lan::pairing::{Pairing, SECRET_LEN};
use tramion_lan::session::{Outcome, run_initiator};

/// Tempo máximo para uma tentativa de conexão a um endereço.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(4);
const IO_TIMEOUT: Duration = Duration::from_secs(30);

/// O resultado de sincronizar com um aparelho, para a interface mostrar.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub device: String,
    pub name: String,
    pub ok: bool,
    /// Quantos registros foram gravados aqui.
    pub applied: usize,
    pub conflicts: usize,
    /// O motivo, quando falhou.
    pub error: Option<String>,
}

fn lan(e: LanError) -> NotesError {
    NotesError::Internal(e.to_string())
}

/// Tenta cada endereço até um conectar.
fn dial(addrs: &[String]) -> Result<TcpStream, NotesError> {
    let mut tried: Vec<String> = Vec::new();
    for addr in addrs {
        let resolved: Vec<SocketAddr> = match addr.to_socket_addrs() {
            Ok(found) => found.collect(),
            Err(e) => {
                tried.push(format!("{addr}: {e}"));
                continue;
            }
        };
        for target in resolved {
            match TcpStream::connect_timeout(&target, CONNECT_TIMEOUT) {
                Ok(stream) => {
                    let _ = stream.set_read_timeout(Some(IO_TIMEOUT));
                    let _ = stream.set_write_timeout(Some(IO_TIMEOUT));
                    return Ok(stream);
                }
                Err(e) => tried.push(format!("{target}: {e}")),
            }
        }
    }
    Err(NotesError::Internal(format!(
        "não foi possível alcançar o outro aparelho. Confira se os dois estão na mesma rede Wi-Fi e se o Tramion está aberto lá. Tentativas: {}",
        if tried.is_empty() {
            "nenhum endereço".to_string()
        } else {
            tried.join("; ")
        }
    )))
}

fn run(
    db: &SharedDatabase,
    addrs: &[String],
    secret: &[u8; SECRET_LEN],
) -> Result<Outcome, NotesError> {
    let stream = dial(addrs)?;
    let mut channel = SecureChannel::connect(stream, secret).map_err(lan)?;
    run_initiator(&mut channel, &mut DbStore::new(db)).map_err(lan)
}

/// Pareia com outro aparelho a partir do texto do QR e já faz a primeira sincronização. Ao fim, o segredo do QR
/// foi trocado pelo definitivo (dentro do canal seguro) e o outro aparelho fica guardado com seus endereços.
pub fn pair_with_code(db: &SharedDatabase, code: &str) -> Result<SyncReport, NotesError> {
    let pairing = Pairing::decode(code).map_err(lan)?;
    let secret = pairing.secret_bytes().map_err(lan)?;
    let outcome = run(db, &pairing.addrs, &secret)?;
    let guard = db
        .lock()
        .map_err(|_| NotesError::Internal("banco indisponível".into()))?;
    sync_peers::set_peer_addrs(guard.connection(), &pairing.device, &pairing.addrs)?;
    let name = sync_peers::peer_name(guard.connection(), &pairing.device)?
        .unwrap_or_else(|| "Aparelho".into());
    Ok(SyncReport {
        device: pairing.device,
        name,
        ok: true,
        applied: outcome.applied,
        conflicts: outcome.conflicts,
        error: None,
    })
}

/// Sincroniza com todos os aparelhos pareados que este conhece o endereço. Uma falha num não impede os outros.
pub fn sync_all(db: &SharedDatabase) -> Result<Vec<SyncReport>, NotesError> {
    let peers = {
        let guard = db
            .lock()
            .map_err(|_| NotesError::Internal("banco indisponível".into()))?;
        let names: std::collections::HashMap<String, String> =
            sync_peers::list_peers(guard.connection())?
                .into_iter()
                .map(|p| (p.device, p.name))
                .collect();
        sync_peers::dialable_peers(guard.connection())?
            .into_iter()
            .map(|(device, secret, addrs)| {
                let name = names
                    .get(&device)
                    .cloned()
                    .unwrap_or_else(|| device.clone());
                (device, name, secret, addrs)
            })
            .collect::<Vec<_>>()
    };
    Ok(peers
        .into_iter()
        .map(
            |(device, name, secret, addrs)| match run(db, &addrs, &secret) {
                Ok(o) => SyncReport {
                    device,
                    name,
                    ok: true,
                    applied: o.applied,
                    conflicts: o.conflicts,
                    error: None,
                },
                Err(e) => SyncReport {
                    device,
                    name,
                    ok: false,
                    applied: 0,
                    conflicts: 0,
                    error: Some(e.to_string()),
                },
            },
        )
        .collect())
}
