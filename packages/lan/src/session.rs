//! O protocolo de um encontro entre dois aparelhos pareados.
//!
//! Quem conecta ([`run_initiator`]) envia seus registros; quem recebe ([`run_responder`]) mescla com os dele, usando
//! a base do último encontro com aquele aparelho, aplica o que lhe cabe e devolve o que o outro deve aplicar. No fim,
//! os dois guardam o estado final como nova base.

use crate::{LanError, channel::SecureChannel, pairing::secret_from_hex};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use tramion_sync::{Record, merge};

/// Versão do protocolo; versões diferentes não conversam.
pub const PROTOCOL: u32 = 1;

/// O que o aparelho precisa oferecer à sincronização.
pub trait Store {
    fn device_id(&self) -> String;
    fn export(&mut self) -> Result<Vec<Record>, String>;
    fn apply(&mut self, records: &[Record]) -> Result<(), String>;
    /// O estado de ambos no último encontro com `peer` (vazio no primeiro).
    fn base(&mut self, peer: &str) -> Result<Vec<Record>, String>;
    fn save_base(&mut self, peer: &str, records: &[Record]) -> Result<(), String>;
    /// Guarda o segredo definitivo do pareamento com `peer` (recebido, já dentro do canal seguro, no lugar do que
    /// estava no QR).
    fn rotate_secret(&mut self, peer: &str, secret_hex: &str) -> Result<(), String>;
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Message {
    Hello {
        protocol: u32,
        device: String,
        records: Vec<Record>,
    },
    Plan {
        apply: Vec<Record>,
        conflicts: usize,
        rotate: Option<String>,
    },
    Done,
}

/// O que um encontro fez, do ponto de vista de quem o rodou.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outcome {
    pub peer: String,
    /// Quantos registros foram gravados neste aparelho.
    pub applied: usize,
    /// Cópias em conflito criadas.
    pub conflicts: usize,
}

fn store_err(e: String) -> LanError {
    LanError::Store(e)
}

fn encode(m: &Message) -> Vec<u8> {
    serde_json::to_vec(m).expect("serializável")
}

fn decode(bytes: &[u8]) -> Result<Message, LanError> {
    serde_json::from_slice(bytes).map_err(|e| LanError::Protocol(e.to_string()))
}

/// Quem conecta (o celular).
pub fn run_initiator<T: Read + Write, S: Store>(
    channel: &mut SecureChannel<T>,
    store: &mut S,
) -> Result<Outcome, LanError> {
    let records = store.export().map_err(store_err)?;
    channel.send(&encode(&Message::Hello {
        protocol: PROTOCOL,
        device: store.device_id(),
        records,
    }))?;
    let Message::Plan {
        apply,
        conflicts,
        rotate,
    } = decode(&channel.recv()?)?
    else {
        return Err(LanError::Protocol("esperava o plano".into()));
    };
    store.apply(&apply).map_err(store_err)?;
    channel.send(&encode(&Message::Done))?;
    // A outra ponta ficou com os registros dela + os nossos mesclados: guardamos o que temos agora.
    let peer = read_peer_id(channel)?;
    if let Some(secret) = rotate {
        if secret_from_hex(&secret).is_err() {
            return Err(LanError::Protocol("segredo definitivo inválido".into()));
        }
        store.rotate_secret(&peer, &secret).map_err(store_err)?;
    }
    let after = store.export().map_err(store_err)?;
    store.save_base(&peer, &after).map_err(store_err)?;
    Ok(Outcome {
        peer,
        applied: apply.len(),
        conflicts,
    })
}

fn read_peer_id<T: Read + Write>(channel: &mut SecureChannel<T>) -> Result<String, LanError> {
    match decode(&channel.recv()?)? {
        Message::Hello { device, .. } => Ok(device),
        _ => Err(LanError::Protocol("esperava a identificação final".into())),
    }
}

/// Quem recebe (o computador). Se `rotate` traz um segredo (primeiro pareamento, feito pelo QR), ele é entregue ao
/// outro aparelho pelo canal seguro e passa a ser o segredo definitivo: o do QR morre ali.
pub fn run_responder<T: Read + Write, S: Store>(
    channel: &mut SecureChannel<T>,
    store: &mut S,
    rotate: Option<&str>,
) -> Result<Outcome, LanError> {
    let Message::Hello {
        protocol,
        device: peer,
        records: theirs,
    } = decode(&channel.recv()?)?
    else {
        return Err(LanError::Protocol("esperava a abertura".into()));
    };
    if protocol != PROTOCOL {
        return Err(LanError::Protocol(format!(
            "versão {protocol} do protocolo não é suportada"
        )));
    }
    let ours = store.export().map_err(store_err)?;
    let base = store.base(&peer).map_err(store_err)?;
    let result = merge(&base, &ours, &theirs);
    store.apply(&result.for_a.apply).map_err(store_err)?;
    channel.send(&encode(&Message::Plan {
        apply: result.for_b.apply,
        conflicts: result.conflicts.len(),
        rotate: rotate.map(str::to_string),
    }))?;
    let Message::Done = decode(&channel.recv()?)? else {
        return Err(LanError::Protocol("esperava a confirmação".into()));
    };
    channel.send(&encode(&Message::Hello {
        protocol: PROTOCOL,
        device: store.device_id(),
        records: Vec::new(),
    }))?;
    if let Some(secret) = rotate {
        store.rotate_secret(&peer, secret).map_err(store_err)?;
    }
    let after = store.export().map_err(store_err)?;
    store.save_base(&peer, &after).map_err(store_err)?;
    Ok(Outcome {
        peer,
        applied: result.for_a.apply.len(),
        conflicts: result.conflicts.len(),
    })
}
