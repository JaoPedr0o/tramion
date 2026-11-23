//! Sincronização pela rede local (ADR 0020, fase 3).
//!
//! - [`pairing`]: o código do QR (id do aparelho, segredo compartilhado e endereço).
//! - [`channel`]: canal criptografado e autenticado pelo segredo (Noise NNpsk0), com mensagens grandes em pedaços.
//! - [`session`]: o protocolo de um encontro (quem conecta envia seus registros; quem recebe mescla e responde).
//!
//! Nada aqui conhece banco: o aparelho entrega um [`session::Store`]. Quem não tem o segredo do pareamento não
//! consegue nem completar o aperto de mão, então não lê nem grava nada.

pub mod channel;
pub mod pairing;
pub mod session;

/// Erros da rede local.
#[derive(Debug)]
pub enum LanError {
    Io(std::io::Error),
    /// Aperto de mão ou mensagem inválida: segredo errado, dados corrompidos ou adulterados.
    Crypto(String),
    /// A outra ponta mandou algo fora do protocolo ou grande demais.
    Protocol(String),
    /// Código de pareamento ilegível.
    Pairing(String),
    Store(String),
}

impl std::fmt::Display for LanError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LanError::Io(e) => write!(f, "erro de rede: {e}"),
            LanError::Crypto(e) => write!(
                f,
                "falha de segurança (segredo errado ou dados alterados): {e}"
            ),
            LanError::Protocol(e) => write!(f, "protocolo inválido: {e}"),
            LanError::Pairing(e) => write!(f, "código de pareamento inválido: {e}"),
            LanError::Store(e) => write!(f, "erro ao acessar os dados: {e}"),
        }
    }
}

impl std::error::Error for LanError {}

impl From<std::io::Error> for LanError {
    fn from(e: std::io::Error) -> Self {
        LanError::Io(e)
    }
}
