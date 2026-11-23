//! O código de pareamento, mostrado como QR no computador e lido pelo celular.

use crate::LanError;
use serde::{Deserialize, Serialize};

/// Tamanho do segredo compartilhado, em bytes.
pub const SECRET_LEN: usize = 32;
const PREFIX: &str = "tramion-pair:1:";

/// O que o QR carrega.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pairing {
    /// Id de quem mostra o QR.
    pub device: String,
    /// Segredo compartilhado (hexadecimal, 64 caracteres). Quem lê o QR passa a conhecê-lo.
    pub secret: String,
    /// Endereços onde tentar conectar (`ip:porta`), do mais provável ao menos.
    pub addrs: Vec<String>,
}

/// Gera um segredo novo, aleatório (do sistema operacional).
pub fn new_secret() -> Result<[u8; SECRET_LEN], LanError> {
    let mut key = [0u8; SECRET_LEN];
    getrandom::fill(&mut key).map_err(|e| LanError::Crypto(e.to_string()))?;
    Ok(key)
}

pub fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn secret_from_hex(hex: &str) -> Result<[u8; SECRET_LEN], LanError> {
    if hex.len() != SECRET_LEN * 2 || !hex.is_ascii() {
        return Err(LanError::Pairing(
            "o segredo deve ter 64 caracteres hexadecimais".into(),
        ));
    }
    let mut out = [0u8; SECRET_LEN];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16)
            .map_err(|_| LanError::Pairing("o segredo tem caracteres inválidos".into()))?;
    }
    Ok(out)
}

impl Pairing {
    /// Texto para virar QR.
    pub fn encode(&self) -> String {
        format!(
            "{PREFIX}{}",
            serde_json::to_string(self).expect("serializável")
        )
    }

    /// Lê o texto de um QR, validando tudo (prefixo, JSON, segredo e endereços).
    pub fn decode(text: &str) -> Result<Pairing, LanError> {
        let json = text
            .trim()
            .strip_prefix(PREFIX)
            .ok_or_else(|| LanError::Pairing("não é um código do Tramion".into()))?;
        let pairing: Pairing =
            serde_json::from_str(json).map_err(|e| LanError::Pairing(e.to_string()))?;
        secret_from_hex(&pairing.secret)?;
        if pairing.device.is_empty() || pairing.device.len() > 64 {
            return Err(LanError::Pairing("id de aparelho inválido".into()));
        }
        if pairing.addrs.is_empty() || pairing.addrs.len() > 8 {
            return Err(LanError::Pairing("endereços inválidos".into()));
        }
        Ok(pairing)
    }

    pub fn secret_bytes(&self) -> Result<[u8; SECRET_LEN], LanError> {
        secret_from_hex(&self.secret)
    }
}
