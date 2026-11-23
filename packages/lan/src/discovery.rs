//! Descoberta dos aparelhos pela rede local (mDNS), para o celular achar o computador mesmo quando o IP dele muda.
//!
//! O computador anuncia um serviço `_tramion._tcp` cujo nome é o id do aparelho; o celular procura pelo id do
//! computador que já conhece. O endereço achado é só **onde tentar conectar**: quem não tem o segredo do pareamento não
//! completa o aperto de mão, então um anúncio falso no máximo faz a conexão falhar.

use crate::LanError;
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::net::{IpAddr, Ipv4Addr};
use std::sync::Once;
use std::time::{Duration, Instant};

/// Encaminha o registro interno da biblioteca de mDNS para a saída de erro (no Android, o `logcat`). A descoberta é a
/// parte da sincronização mais difícil de diagnosticar sem isso: sem registro, uma busca que falha não deixa rastro.
struct StderrLog;

impl log::Log for StderrLog {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.target().starts_with("mdns_sd") && metadata.level() <= log::Level::Warn
    }

    fn log(&self, record: &log::Record) {
        if self.enabled(record.metadata()) {
            eprintln!("[mdns] {} {}", record.level(), record.args());
        }
    }

    fn flush(&self) {}
}

static LOGGER: StderrLog = StderrLog;

fn init_logging() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        // Se o aplicativo já instalou um registro próprio, respeita o dele.
        if log::set_logger(&LOGGER).is_ok() {
            log::set_max_level(log::LevelFilter::Warn);
        }
    });
}

pub const SERVICE_TYPE: &str = "_tramion._tcp.local.";
/// Máximo de endereços devolvidos por uma descoberta.
pub const MAX_FOUND: usize = 4;

/// O nome completo do serviço de um aparelho (`<id>._tramion._tcp.local.`).
pub fn fullname(device: &str) -> String {
    format!("{device}.{SERVICE_TYPE}")
}

/// O `fullname` encontrado na rede é do aparelho procurado?
pub fn is_device(found_fullname: &str, device: &str) -> bool {
    found_fullname.eq_ignore_ascii_case(&fullname(device))
}

/// Escolhe os endereços a tentar: só IPv4 de rede local (privados), sem repetir, em ordem estável e limitados.
pub fn pick_addrs<I: IntoIterator<Item = IpAddr>>(addrs: I, port: u16) -> Vec<String> {
    let mut v4: Vec<Ipv4Addr> = addrs
        .into_iter()
        .filter_map(|ip| match ip {
            IpAddr::V4(v4) if v4.is_private() && !v4.is_loopback() => Some(v4),
            _ => None,
        })
        .collect();
    v4.sort();
    v4.dedup();
    v4.into_iter()
        .take(MAX_FOUND)
        .map(|ip| format!("{ip}:{port}"))
        .collect()
}

/// O anúncio de um aparelho na rede: enquanto este valor existir, o aparelho é encontrável; ao ser descartado, o
/// anúncio é retirado.
pub struct Advertiser {
    daemon: ServiceDaemon,
    fullname: String,
}

fn mdns(e: mdns_sd::Error) -> LanError {
    LanError::Protocol(format!("mDNS: {e}"))
}

impl Advertiser {
    /// Anuncia `device` na porta `port` (o IP é o das interfaces de rede, descoberto sozinho).
    pub fn start(device: &str, port: u16) -> Result<Self, LanError> {
        let daemon = ServiceDaemon::new().map_err(mdns)?;
        let host = format!("{device}.local.");
        let info = ServiceInfo::new(SERVICE_TYPE, device, &host, "", port, &[("v", "1")][..])
            .map_err(mdns)?
            .enable_addr_auto();
        let fullname = info.get_fullname().to_string();
        daemon.register(info).map_err(mdns)?;
        Ok(Self { daemon, fullname })
    }
}

impl Drop for Advertiser {
    fn drop(&mut self) {
        let _ = self.daemon.unregister(&self.fullname);
        let _ = self.daemon.shutdown();
    }
}

/// Procura `device` na rede por até `timeout` e devolve os endereços (`ip:porta`) onde ele atende. Vazio se não achar.
pub fn resolve(device: &str, timeout: Duration) -> Vec<String> {
    init_logging();
    let daemon = match ServiceDaemon::new() {
        Ok(daemon) => daemon,
        Err(error) => {
            eprintln!("[mdns] não foi possível iniciar a busca: {error}");
            return Vec::new();
        }
    };
    let found = browse(&daemon, device, timeout);
    eprintln!("[mdns] busca por {device}: {found:?}");
    let _ = daemon.stop_browse(SERVICE_TYPE);
    let _ = daemon.shutdown();
    found
}

fn browse(daemon: &ServiceDaemon, device: &str, timeout: Duration) -> Vec<String> {
    let events = match daemon.browse(SERVICE_TYPE) {
        Ok(events) => events,
        Err(error) => {
            eprintln!("[mdns] não foi possível procurar {SERVICE_TYPE}: {error}");
            return Vec::new();
        }
    };
    let deadline = Instant::now() + timeout;
    while let Some(left) = deadline.checked_duration_since(Instant::now()) {
        match events.recv_timeout(left) {
            Ok(ServiceEvent::ServiceResolved(info)) if is_device(info.get_fullname(), device) => {
                let addrs = pick_addrs(
                    info.get_addresses_v4().into_iter().map(IpAddr::V4),
                    info.get_port(),
                );
                if !addrs.is_empty() {
                    return addrs;
                }
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }
    eprintln!("[mdns] nada encontrado para {device} em {timeout:?}");
    Vec::new()
}
