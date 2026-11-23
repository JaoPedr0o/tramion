//! Canal criptografado e autenticado entre dois aparelhos pareados.
//!
//! Usa Noise `NNpsk0` (X25519 + ChaCha20-Poly1305 + BLAKE2s) com o segredo do pareamento como chave pré-compartilhada:
//! só quem conhece o segredo completa o aperto de mão, e cada conexão usa chaves efêmeras novas (sigilo futuro).
//! As mensagens são enviadas em pedaços cifrados, com um limite de tamanho para uma ponta mal-intencionada não
//! esgotar a memória.

use crate::{LanError, pairing::SECRET_LEN};
use std::io::{Read, Write};

const PATTERN: &str = "Noise_NNpsk0_25519_ChaChaPoly_BLAKE2s";
/// Máximo de bytes de uma mensagem do protocolo (64 MB).
pub const MAX_MESSAGE: usize = 64 * 1024 * 1024;
/// Máximo de texto claro por pedaço cifrado (o Noise limita cada pedaço a 65535 bytes, com 16 de etiqueta).
const CHUNK: usize = 60_000;

pub struct SecureChannel<T: Read + Write> {
    io: T,
    noise: snow::TransportState,
}

fn crypto(e: snow::Error) -> LanError {
    LanError::Crypto(e.to_string())
}

fn write_frame<T: Write>(io: &mut T, data: &[u8]) -> Result<(), LanError> {
    io.write_all(&(data.len() as u16).to_be_bytes())?;
    io.write_all(data)?;
    io.flush()?;
    Ok(())
}

fn read_frame<T: Read>(io: &mut T) -> Result<Vec<u8>, LanError> {
    let mut len = [0u8; 2];
    io.read_exact(&mut len)?;
    let mut data = vec![0u8; u16::from_be_bytes(len) as usize];
    io.read_exact(&mut data)?;
    Ok(data)
}

fn builder(secret: &[u8; SECRET_LEN]) -> Result<snow::Builder<'_>, LanError> {
    let params = PATTERN.parse().map_err(crypto)?;
    snow::Builder::new(params).psk(0, secret).map_err(crypto)
}

impl<T: Read + Write> SecureChannel<T> {
    /// Quem conecta (o celular).
    pub fn connect(mut io: T, secret: &[u8; SECRET_LEN]) -> Result<Self, LanError> {
        let mut hs = builder(secret)?.build_initiator().map_err(crypto)?;
        let mut buf = vec![0u8; 1024];
        let n = hs.write_message(&[], &mut buf).map_err(crypto)?;
        write_frame(&mut io, &buf[..n])?;
        let reply = read_frame(&mut io)?;
        hs.read_message(&reply, &mut buf).map_err(crypto)?;
        Ok(Self {
            io,
            noise: hs.into_transport_mode().map_err(crypto)?,
        })
    }

    /// Quem recebe (o computador). Falha se a outra ponta não conhece o segredo.
    pub fn accept(mut io: T, secret: &[u8; SECRET_LEN]) -> Result<Self, LanError> {
        let mut hs = builder(secret)?.build_responder().map_err(crypto)?;
        let mut buf = vec![0u8; 1024];
        let first = read_frame(&mut io)?;
        hs.read_message(&first, &mut buf).map_err(crypto)?;
        let n = hs.write_message(&[], &mut buf).map_err(crypto)?;
        write_frame(&mut io, &buf[..n])?;
        Ok(Self {
            io,
            noise: hs.into_transport_mode().map_err(crypto)?,
        })
    }

    /// Envia uma mensagem inteira (em pedaços cifrados).
    pub fn send(&mut self, message: &[u8]) -> Result<(), LanError> {
        if message.len() > MAX_MESSAGE {
            return Err(LanError::Protocol("mensagem grande demais".into()));
        }
        let chunks = message.len().div_ceil(CHUNK).max(1);
        let mut head = [0u8; 4];
        head.copy_from_slice(&(message.len() as u32).to_be_bytes());
        self.send_chunk(&head)?;
        for i in 0..chunks {
            self.send_chunk(&message[i * CHUNK..((i + 1) * CHUNK).min(message.len())])?;
        }
        Ok(())
    }

    fn send_chunk(&mut self, plain: &[u8]) -> Result<(), LanError> {
        let mut out = vec![0u8; plain.len() + 16];
        let n = self.noise.write_message(plain, &mut out).map_err(crypto)?;
        write_frame(&mut self.io, &out[..n])
    }

    fn recv_chunk(&mut self) -> Result<Vec<u8>, LanError> {
        let frame = read_frame(&mut self.io)?;
        let mut out = vec![0u8; frame.len()];
        let n = self.noise.read_message(&frame, &mut out).map_err(crypto)?;
        out.truncate(n);
        Ok(out)
    }

    /// Recebe uma mensagem inteira, recusando as que passam do limite ANTES de alocar.
    pub fn recv(&mut self) -> Result<Vec<u8>, LanError> {
        let head = self.recv_chunk()?;
        let head: [u8; 4] = head
            .try_into()
            .map_err(|_| LanError::Protocol("cabeçalho inválido".into()))?;
        let len = u32::from_be_bytes(head) as usize;
        if len > MAX_MESSAGE {
            return Err(LanError::Protocol("mensagem grande demais".into()));
        }
        let mut message = Vec::with_capacity(len.min(CHUNK));
        while message.len() < len {
            let part = self.recv_chunk()?;
            if part.is_empty() || message.len() + part.len() > len {
                return Err(LanError::Protocol("pedaços inconsistentes".into()));
            }
            message.extend_from_slice(&part);
        }
        Ok(message)
    }
}
