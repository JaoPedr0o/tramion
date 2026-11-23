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
