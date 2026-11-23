use serde_json::json;
use std::collections::HashMap;
use std::net::{TcpListener, TcpStream};
use std::thread;
use tramion_lan::LanError;
use tramion_lan::channel::SecureChannel;
use tramion_lan::pairing::{Pairing, new_secret, secret_from_hex, to_hex};
use tramion_lan::session::{Store, run_initiator, run_responder};
use tramion_sync::{Record, apply};

#[derive(Default)]
struct Mem {
    id: String,
    records: Vec<Record>,
    bases: HashMap<String, Vec<Record>>,
    secrets: HashMap<String, String>,
    names: HashMap<String, String>,
}

impl Mem {
    fn new(id: &str, records: Vec<Record>) -> Self {
        Mem {
            names: HashMap::new(),
            secrets: HashMap::new(),
            id: id.into(),
            records,
            bases: HashMap::new(),
        }
    }
}

impl Store for Mem {
    fn device_id(&self) -> String {
        self.id.clone()
    }
    fn export(&mut self) -> Result<Vec<Record>, String> {
        Ok(self.records.clone())
    }
    fn apply(&mut self, records: &[Record]) -> Result<(), String> {
        let plan = tramion_sync::Plan {
            apply: records.to_vec(),
        };
        apply(&mut self.records, &plan);
        Ok(())
    }
    fn base(&mut self, peer: &str) -> Result<Vec<Record>, String> {
        Ok(self.bases.get(peer).cloned().unwrap_or_default())
    }
    fn save_base(&mut self, peer: &str, records: &[Record]) -> Result<(), String> {
        self.bases.insert(peer.into(), records.to_vec());
        Ok(())
    }
    fn device_name(&self) -> String {
        format!("Nome de {}", self.id)
    }
    fn peer_seen(&mut self, peer: &str, name: &str) -> Result<(), String> {
        self.names.insert(peer.into(), name.into());
        Ok(())
    }
    fn rotate_secret(&mut self, peer: &str, secret_hex: &str) -> Result<(), String> {
        self.secrets.insert(peer.into(), secret_hex.into());
        Ok(())
    }
}

fn rec(id: &str, at: i64, device: &str, text: &str) -> Record {
    Record {
        id: id.into(),
        kind: "note".into(),
        updated_at: at,
        device: device.into(),
        deleted: false,
        payload: json!({ "text": text }),
    }
}

/// Roda um encontro real por TCP local. Devolve os dois aparelhos e os resultados.
fn meet(
    mut server: Mem,
    mut client: Mem,
    server_secret: [u8; 32],
    client_secret: [u8; 32],
) -> (Mem, Mem, Result<(), LanError>, Result<(), LanError>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let handle = thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        let result = SecureChannel::accept(stream, &server_secret)
            .and_then(|mut ch| run_responder(&mut ch, &mut server, None))
            .map(|_| ());
        (server, result)
    });
    let stream = TcpStream::connect(addr).unwrap();
    let result = SecureChannel::connect(stream, &client_secret)
        .and_then(|mut ch| run_initiator(&mut ch, &mut client))
        .map(|_| ());
    let (server, server_result) = handle.join().unwrap();
    (server, client, server_result, result)
}

fn ids(m: &Mem) -> Vec<String> {
    let mut v: Vec<String> = m.records.iter().map(|r| r.id.clone()).collect();
    v.sort();
    v
}

#[test]
fn dois_aparelhos_pareados_sincronizam_por_tcp() {
    let secret = new_secret().unwrap();
    let server = Mem::new("pc", vec![rec("1", 10, "pc", "do pc")]);
    let client = Mem::new("cel", vec![rec("2", 20, "cel", "do celular")]);

    let (server, client, rs, rc) = meet(server, client, secret, secret);

    rs.unwrap();
    rc.unwrap();
    assert_eq!(ids(&server), ["1", "2"]);
    assert_eq!(ids(&client), ["1", "2"]);
}

#[test]
fn segredo_errado_nao_completa_o_aperto_de_mao_e_nada_vaza() {
    let server = Mem::new("pc", vec![rec("1", 10, "pc", "segredo")]);
    let client = Mem::new("intruso", vec![]);

    let (server, client, rs, rc) =
        meet(server, client, new_secret().unwrap(), new_secret().unwrap());

    assert!(matches!(rs, Err(LanError::Crypto(_))));
    assert!(rc.is_err());
    assert!(client.records.is_empty(), "o intruso não recebeu nada");
    assert_eq!(server.records.len(), 1, "o servidor não gravou nada");
}

#[test]
fn encontros_seguintes_usam_a_base_e_geram_copia_em_conflito() {
    let secret = new_secret().unwrap();
    let server = Mem::new("pc", vec![rec("1", 10, "pc", "v1")]);
    let client = Mem::new("cel", vec![]);
    let (mut server, mut client, ..) = meet(server, client, secret, secret);

    // Os dois editam o mesmo registro entre os encontros.
    server.records[0] = rec("1", 30, "pc", "do pc");
    client.records[0] = rec("1", 40, "cel", "do celular");
    let (server, client, rs, rc) = meet(server, client, secret, secret);

    rs.unwrap();
    rc.unwrap();
    assert_eq!(
        server.records.len(),
        2,
        "uma versão virou cópia em conflito"
    );
    assert_eq!(ids(&server), ids(&client));
    let winner = server.records.iter().find(|r| r.id == "1").unwrap();
    assert_eq!(winner.payload, json!({"text": "do celular"}));
}

#[test]
fn sincronizar_de_novo_sem_mudancas_nao_altera_nada() {
    let secret = new_secret().unwrap();
    let (server, client, ..) = meet(
        Mem::new("pc", vec![rec("1", 10, "pc", "a")]),
        Mem::new("cel", vec![rec("2", 20, "cel", "b")]),
        secret,
        secret,
    );
    let before = (server.records.clone(), client.records.clone());

    let (server, client, ..) = meet(server, client, secret, secret);

    assert_eq!((server.records, client.records), before);
}

#[test]
fn mensagem_grande_atravessa_em_pedacos() {
    let secret = new_secret().unwrap();
    let big: Vec<Record> = (0..300)
        .map(|i| rec(&format!("n{i}"), 5, "cel", &"x".repeat(2000)))
        .collect();

    let (server, _, rs, rc) = meet(Mem::new("pc", vec![]), Mem::new("cel", big), secret, secret);

    rs.unwrap();
    rc.unwrap();
    assert_eq!(server.records.len(), 300);
}

#[test]
fn dados_adulterados_no_caminho_sao_rejeitados() {
    use std::io::{Read, Write};
    let secret = new_secret().unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        let mut ch = SecureChannel::accept(stream, &secret).unwrap();
        ch.recv().map(|_| ()).unwrap_err()
    });
    // Cliente que faz o aperto de mão certo e depois manda lixo cifrado por outra chave de sessão.
    let stream = TcpStream::connect(addr).unwrap();
    let mut raw = stream.try_clone().unwrap();
    let _ch = SecureChannel::connect(stream, &secret).unwrap();
    raw.write_all(&[0, 20]).unwrap();
    raw.write_all(&[7u8; 20]).unwrap();
    raw.flush().unwrap();
    let _ = raw.read(&mut [0u8; 1]);

    assert!(matches!(server.join().unwrap(), LanError::Crypto(_)));
}

#[test]
fn codigo_do_qr_ida_e_volta_e_validacoes() {
    let secret = new_secret().unwrap();
    let pairing = Pairing {
        device: "pc".into(),
        secret: to_hex(&secret),
        addrs: vec!["192.168.0.5:4455".into()],
    };

    let back = Pairing::decode(&pairing.encode()).unwrap();

    assert_eq!(back, pairing);
    assert_eq!(back.secret_bytes().unwrap(), secret);
    assert!(Pairing::decode("https://exemplo.com").is_err());
    assert!(Pairing::decode("tramion-pair:1:{").is_err());
    let curto = Pairing {
        secret: "abc".into(),
        ..pairing.clone()
    };
    assert!(Pairing::decode(&curto.encode()).is_err());
    let sem_enderecos = Pairing {
        addrs: vec![],
        ..pairing
    };
    assert!(Pairing::decode(&sem_enderecos.encode()).is_err());
    assert!(secret_from_hex(&"zz".repeat(32)).is_err());
}

#[test]
fn segredos_gerados_sao_diferentes() {
    assert_ne!(new_secret().unwrap(), new_secret().unwrap());
}

#[test]
fn accept_any_escolhe_o_segredo_certo_entre_varios() {
    let (a, b, c) = (
        new_secret().unwrap(),
        new_secret().unwrap(),
        new_secret().unwrap(),
    );
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        SecureChannel::accept_any(stream, &[a, b, c]).map(|(_, i)| i)
    });

    let stream = TcpStream::connect(addr).unwrap();
    SecureChannel::connect(stream, &b).unwrap();

    assert_eq!(server.join().unwrap().unwrap(), 1);
}

#[test]
fn accept_any_recusa_quando_nenhum_segredo_serve() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let known = [new_secret().unwrap(), new_secret().unwrap()];
    let server = thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        SecureChannel::accept_any(stream, &known).map(|_| ())
    });

    let stream = TcpStream::connect(addr).unwrap();
    let _ = SecureChannel::connect(stream, &new_secret().unwrap());

    assert!(matches!(server.join().unwrap(), Err(LanError::Crypto(_))));
}

#[test]
fn o_segredo_definitivo_chega_ao_celular_pelo_canal_seguro() {
    let secret = new_secret().unwrap();
    let new = to_hex(&new_secret().unwrap());
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let new_for_server = new.clone();
    let server = thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        let mut store = Mem::new("pc", vec![]);
        let mut ch = SecureChannel::accept(stream, &secret).unwrap();
        run_responder(&mut ch, &mut store, Some(&new_for_server)).unwrap();
        store
    });
    let mut phone = Mem::new("cel", vec![]);
    let mut ch = SecureChannel::connect(TcpStream::connect(addr).unwrap(), &secret).unwrap();

    run_initiator(&mut ch, &mut phone).unwrap();

    let pc = server.join().unwrap();
    assert_eq!(phone.secrets.get("pc"), Some(&new));
    assert_eq!(pc.secrets.get("cel"), Some(&new));
}

#[test]
fn cada_aparelho_aprende_o_nome_do_outro() {
    let secret = new_secret().unwrap();

    let (server, client, rs, rc) = meet(
        Mem::new("pc", vec![]),
        Mem::new("cel", vec![]),
        secret,
        secret,
    );

    rs.unwrap();
    rc.unwrap();
    assert_eq!(
        server.names.get("cel").map(String::as_str),
        Some("Nome de cel")
    );
    assert_eq!(
        client.names.get("pc").map(String::as_str),
        Some("Nome de pc")
    );
}

// ───────── Descoberta (partes que não dependem da rede) ─────────

use std::net::{IpAddr, Ipv4Addr};
use tramion_lan::discovery::{MAX_FOUND, fullname, is_device, pick_addrs};

fn ip(a: u8, b: u8, c: u8, d: u8) -> IpAddr {
    IpAddr::V4(Ipv4Addr::new(a, b, c, d))
}

#[test]
fn nome_do_servico_e_a_comparacao_do_aparelho() {
    assert_eq!(fullname("abc123"), "abc123._tramion._tcp.local.");
    assert!(is_device("abc123._tramion._tcp.local.", "abc123"));
    assert!(
        is_device("ABC123._tramion._tcp.local.", "abc123"),
        "sem diferenciar maiúsculas"
    );
    assert!(!is_device("outro._tramion._tcp.local.", "abc123"));
    assert!(
        !is_device("abc123x._tramion._tcp.local.", "abc123"),
        "o prefixo não basta"
    );
}

#[test]
fn enderecos_achados_so_ipv4_de_rede_local_sem_repetir_e_limitados() {
    let found = pick_addrs(
        [
            ip(192, 168, 1, 10),
            ip(192, 168, 1, 10),
            ip(8, 8, 8, 8),
            ip(127, 0, 0, 1),
            IpAddr::V6("fe80::1".parse().unwrap()),
            ip(10, 0, 0, 5),
        ],
        47653,
    );

    assert_eq!(found, ["10.0.0.5:47653", "192.168.1.10:47653"]);
    let many = pick_addrs((1..=20).map(|i| ip(192, 168, 1, i)), 1);
    assert_eq!(many.len(), MAX_FOUND);
}

#[test]
fn procurar_sem_ninguem_na_rede_volta_vazio_dentro_do_prazo() {
    let started = std::time::Instant::now();

    let found = tramion_lan::discovery::resolve(
        "aparelho-que-nao-existe",
        std::time::Duration::from_millis(400),
    );

    assert!(found.is_empty());
    assert!(started.elapsed() < std::time::Duration::from_secs(5));
}
