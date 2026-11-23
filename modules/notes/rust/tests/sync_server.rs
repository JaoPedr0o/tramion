//! O servidor do computador e o aparelho do celular, cada um com um banco real, conversando por TCP.

use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::thread;
use tramion_infra_sqlite::{Database, SharedDatabase};
use tramion_lan::channel::SecureChannel;
use tramion_lan::pairing::{Pairing, secret_from_hex};
use tramion_lan::session::run_initiator;
use tramion_notes::MIGRATIONS;
use tramion_notes::model::NewNote;
use tramion_notes::service;
use tramion_notes::sync_peers::{DbStore, add_peer, list_peers, remove_peer};
use tramion_notes::sync_server::{SyncState, handle_connection, make_offer};

fn shared(name: &str) -> SharedDatabase {
    let db = Database::open_in_memory(&[MIGRATIONS]).unwrap();
    db.connection()
        .execute(
            "INSERT OR REPLACE INTO notes_meta (key, value) VALUES ('device_id', ?1)",
            [name],
        )
        .unwrap();
    Mutex::new(db)
}

fn note(db: &SharedDatabase, title: &str) {
    service::create(
        db.lock().unwrap().connection(),
        NewNote {
            title: title.into(),
            body: String::new(),
            parent_id: None,
        },
    )
    .unwrap();
}

fn titles(db: &SharedDatabase) -> Vec<String> {
    let guard = db.lock().unwrap();
    let mut stmt = guard
        .connection()
        .prepare("SELECT title FROM notes_note ORDER BY title")
        .unwrap();
    stmt.query_map([], |r| r.get(0))
        .unwrap()
        .map(Result::unwrap)
        .collect()
}

/// O celular conecta com `secret`. Devolve o resultado dos dois lados.
fn connect(
    desktop: &'static SharedDatabase,
    state: &'static SyncState,
    phone: &SharedDatabase,
    secret_hex: &str,
) -> (Result<(), String>, Result<(), String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        handle_connection(desktop, state, stream)
            .map(|_| ())
            .map_err(|e| e.to_string())
    });
    let secret = secret_from_hex(secret_hex).unwrap();
    let result = TcpStream::connect(addr)
        .map_err(|e| e.to_string())
        .and_then(|s| SecureChannel::connect(s, &secret).map_err(|e| e.to_string()))
        .and_then(|mut ch| {
            run_initiator(&mut ch, &mut DbStore::new(phone))
                .map(|_| ())
                .map_err(|e| e.to_string())
        });
    (server.join().unwrap(), result)
}

fn leak<T>(value: T) -> &'static T {
    Box::leak(Box::new(value))
}

/// O segredo definitivo que o celular guardou do computador.
fn phone_secret(phone: &SharedDatabase) -> String {
    let guard = phone.lock().unwrap();
    let (_, secret) = tramion_notes::sync_peers::peer_secrets(guard.connection())
        .unwrap()
        .remove(0);
    tramion_lan::pairing::to_hex(&secret)
}

fn pairing_secret(state: &SyncState) -> String {
    state.open_pairing(0).map(|(s, _)| s).unwrap()
}

#[test]
fn parear_pelo_qr_registra_o_aparelho_e_sincroniza() {
    let desktop = leak(shared("pc"));
    let state = leak(SyncState::default());
    let phone = shared("cel");
    note(desktop, "Do computador");
    note(&phone, "Do celular");
    // `open_pairing(0)` usa a hora 0; o QR vale PAIRING_TTL a partir dela, então precisamos de um QR "de agora".
    let (secret, _) = state.open_pairing(i64::MAX / 2 - 1).unwrap();

    let (rs, rc) = connect(desktop, state, &phone, &secret);

    rs.unwrap();
    rc.unwrap();
    assert_eq!(titles(desktop), ["Do celular", "Do computador"]);
    assert_eq!(titles(&phone), titles(desktop));
    let peers = list_peers(desktop.lock().unwrap().connection()).unwrap();
    assert_eq!(peers.len(), 1);
    assert_eq!(peers[0].device, "cel");
    assert!(peers[0].last_sync_at.is_some());
}

#[test]
fn cada_qr_vale_para_um_unico_pareamento() {
    let desktop = leak(shared("pc"));
    let state = leak(SyncState::default());
    let (secret, _) = state.open_pairing(i64::MAX / 2 - 1).unwrap();
    let phone = shared("cel");
    let (rs, _) = connect(desktop, state, &phone, &secret);
    rs.unwrap();

    let (rs2, rc2) = connect(desktop, state, &shared("intruso"), &secret);

    assert!(rs2.is_err() || rc2.is_err(), "o QR já foi usado e morreu");
    let guard = desktop.lock().unwrap();
    assert_eq!(list_peers(guard.connection()).unwrap().len(), 1);
    assert_ne!(
        phone_secret(&phone),
        secret,
        "o segredo definitivo não é o do QR"
    );
    let stored = tramion_notes::sync_peers::peer_secrets(guard.connection()).unwrap();
    assert_eq!(
        tramion_lan::pairing::to_hex(&stored[0].1),
        phone_secret(&phone)
    );
}

#[test]
fn qr_vencido_nao_e_aceito() {
    let desktop = leak(shared("pc"));
    let state = leak(SyncState::default());
    let secret = pairing_secret(state); // expira logo depois do instante 0: já venceu

    let (rs, _) = connect(desktop, state, &shared("cel"), &secret);

    assert!(rs.is_err());
    assert!(
        list_peers(desktop.lock().unwrap().connection())
            .unwrap()
            .is_empty()
    );
}

#[test]
fn aparelho_ja_pareado_volta_a_sincronizar_sem_novo_qr_e_revogar_corta_o_acesso() {
    let desktop = leak(shared("pc"));
    let state = leak(SyncState::default());
    let phone = shared("cel");
    let (secret, _) = state.open_pairing(i64::MAX / 2 - 1).unwrap();
    connect(desktop, state, &phone, &secret).0.unwrap();
    note(&phone, "Nova no celular");

    let definitive = phone_secret(&phone);
    let (rs, rc) = connect(desktop, state, &phone, &definitive);
    rs.unwrap();
    rc.unwrap();
    assert!(titles(desktop).contains(&"Nova no celular".to_string()));

    remove_peer(desktop.lock().unwrap().connection(), "cel").unwrap();
    let (rs, rc) = connect(desktop, state, &phone, &definitive);
    assert!(rs.is_err() || rc.is_err(), "revogado não conecta mais");
}

#[test]
fn limite_de_aparelhos_pareados() {
    let db = shared("pc");
    let guard = db.lock().unwrap();
    let secret = "ab".repeat(32);
    for i in 0..tramion_notes::sync_peers::MAX_PEERS {
        add_peer(guard.connection(), &format!("d{i}"), "x", &secret).unwrap();
    }

    assert!(add_peer(guard.connection(), "extra", "x", &secret).is_err());
    assert!(
        add_peer(guard.connection(), "d0", "renovado", &secret).is_ok(),
        "renovar não conta"
    );
}

#[test]
fn oferta_do_qr_tem_codigo_decodificavel_e_svg() {
    let pairing = Pairing {
        device: "pc".into(),
        secret: "ab".repeat(32),
        addrs: vec!["192.168.0.5:47653".into()],
    };

    let offer = make_offer(&pairing.encode(), 123).unwrap();

    assert_eq!(Pairing::decode(&offer.code).unwrap(), pairing);
    assert!(offer.svg.contains("<svg"));
    assert_eq!(offer.expires_at, 123);
}

// ───────── O lado do celular: parear por código e sincronizar ─────────

use tramion_notes::sync_client::{pair_with_code, sync_all};

/// Sobe o servidor do computador numa porta local e atende `n` conexões. Devolve o endereço.
fn serve(
    desktop: &'static SharedDatabase,
    state: &'static SyncState,
    connections: usize,
) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap().to_string();
    let handle = thread::spawn(move || {
        for _ in 0..connections {
            let (stream, _) = listener.accept().unwrap();
            let _ = handle_connection(desktop, state, stream);
        }
    });
    (addr, handle)
}

fn code_for(state: &SyncState, device: &str, addr: &str) -> String {
    let (secret, _) = state.open_pairing(i64::MAX / 2 - 1).unwrap();
    Pairing {
        device: device.into(),
        secret,
        addrs: vec![addr.into()],
    }
    .encode()
}

#[test]
fn celular_pareia_pelo_codigo_sincroniza_e_guarda_o_computador() {
    let desktop = leak(shared("pc"));
    let state = leak(SyncState::default());
    let phone = shared("cel");
    note(desktop, "Do computador");
    note(&phone, "Do celular");
    let (addr, server) = serve(desktop, state, 1);

    let report = pair_with_code(&phone, &code_for(state, "pc", &addr)).unwrap();

    server.join().unwrap();
    assert!(report.ok);
    assert_eq!(titles(&phone), ["Do celular", "Do computador"]);
    assert_eq!(titles(desktop), titles(&phone));
    let peers = list_peers(phone.lock().unwrap().connection()).unwrap();
    assert_eq!(
        (peers[0].device.as_str(), peers[0].name.as_str()),
        ("pc", "Computador")
    );
}

#[test]
fn sincronizar_agora_usa_o_segredo_e_o_endereco_guardados() {
    let desktop = leak(shared("pc"));
    let state = leak(SyncState::default());
    let phone = shared("cel");
    let (addr, server) = serve(desktop, state, 2);
    pair_with_code(&phone, &code_for(state, "pc", &addr)).unwrap();
    note(&phone, "Escrita depois");

    let reports = sync_all(&phone).unwrap();

    server.join().unwrap();
    assert_eq!(reports.len(), 1);
    assert!(reports[0].ok, "{:?}", reports[0].error);
    assert!(titles(desktop).contains(&"Escrita depois".to_string()));
}

#[test]
fn computador_desligado_da_um_motivo_claro_e_nao_trava_os_outros() {
    let desktop = leak(shared("pc"));
    let state = leak(SyncState::default());
    let phone = shared("cel");
    let (addr, server) = serve(desktop, state, 1);
    pair_with_code(&phone, &code_for(state, "pc", &addr)).unwrap();
    server.join().unwrap(); // o "computador" parou de escutar

    let reports = sync_all(&phone).unwrap();

    assert_eq!(reports.len(), 1);
    assert!(!reports[0].ok);
    assert!(
        reports[0]
            .error
            .as_ref()
            .unwrap()
            .contains("mesma rede Wi-Fi")
    );
}

#[test]
fn codigo_invalido_ou_sem_computador_falha_sem_gravar_nada() {
    let phone = shared("cel");

    assert!(pair_with_code(&phone, "https://exemplo.com").is_err());
    let nobody = Pairing {
        device: "pc".into(),
        secret: "ab".repeat(32),
        addrs: vec!["127.0.0.1:9".into()],
    };
    assert!(pair_with_code(&phone, &nobody.encode()).is_err());
    assert!(
        list_peers(phone.lock().unwrap().connection())
            .unwrap()
            .is_empty()
    );
}

#[test]
fn sem_aparelhos_pareados_sincronizar_agora_nao_faz_nada() {
    let phone = shared("cel");

    assert!(sync_all(&phone).unwrap().is_empty());
}

// ───────── Endereços do QR e nomes ─────────

use std::net::Ipv4Addr;
use tramion_notes::sync_server::rank_addrs;

fn iface(name: &str, ip: [u8; 4]) -> (String, Ipv4Addr) {
    (name.to_string(), Ipv4Addr::from(ip))
}

#[test]
fn enderecos_do_qr_ignoram_interfaces_virtuais_e_priorizam_wifi_e_cabo() {
    let addrs = rank_addrs(
        vec![
            iface("podman0", [10, 88, 0, 1]),
            iface("virbr0", [192, 168, 122, 1]),
            iface("docker0", [172, 17, 0, 1]),
            iface("tailscale0", [100, 64, 0, 1]),
            iface("lo", [127, 0, 0, 1]),
            iface("zzcustom0", [10, 1, 1, 5]),
            iface("wlan0", [192, 168, 1, 20]),
            iface("enp5s0", [192, 168, 1, 10]),
            iface("eth1", [8, 8, 8, 8]),
        ],
        47653,
    );

    assert_eq!(
        addrs,
        ["192.168.1.10:47653", "192.168.1.20:47653", "10.1.1.5:47653"]
    );
}

#[test]
fn enderecos_repetidos_e_em_excesso_sao_cortados() {
    let many: Vec<(String, Ipv4Addr)> = (0..20)
        .map(|i| iface("wlan0", [192, 168, 1, i + 1]))
        .collect();
    let dup = vec![
        iface("wlan0", [192, 168, 1, 5]),
        iface("wlan0", [192, 168, 1, 5]),
    ];

    assert_eq!(rank_addrs(many, 1).len(), 8);
    assert_eq!(rank_addrs(dup, 1), ["192.168.1.5:1"]);
}

#[test]
fn quem_conecta_e_registrado_com_o_nome_que_informou() {
    let desktop = leak(shared("pc"));
    let state = leak(SyncState::default());
    let phone = shared("cel");
    let (addr, server) = serve(desktop, state, 1);

    pair_with_code(&phone, &code_for(state, "pc", &addr)).unwrap();

    server.join().unwrap();
    // Os dois lados de teste são "Computador" (a máquina de teste não é Android).
    let on_desktop = list_peers(desktop.lock().unwrap().connection()).unwrap();
    let on_phone = list_peers(phone.lock().unwrap().connection()).unwrap();
    assert_eq!(on_desktop[0].name, "Computador");
    assert_eq!(on_phone[0].name, "Computador");
}
