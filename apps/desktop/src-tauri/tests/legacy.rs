use desktop_lib::legacy::{CURRENT_DB, migrate_from_any_legacy, migrate_legacy_data};
use std::fs;
use tempfile::tempdir;

const OLD_DB: &str = "aesthetic-notes.db";
const OLDEST_DB: &str = "aesthetic-ugly-notes.db";

fn write(path: &std::path::Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

fn read(path: &std::path::Path) -> String {
    fs::read_to_string(path).unwrap()
}

#[test]
fn move_a_pasta_inteira_e_renomeia_o_banco_com_os_arquivos_do_wal() {
    let root = tempdir().unwrap();
    let legacy = root.path().join("dev.aesthetic.notes");
    let data = root.path().join("dev.tramion.app");
    write(&legacy.join(OLD_DB), "banco");
    write(&legacy.join(format!("{OLD_DB}-wal")), "wal");
    write(&legacy.join(format!("{OLD_DB}-shm")), "shm");
    write(&legacy.join("assets/foto.png"), "img");
    write(&legacy.join("backups/b1.db"), "bkp");

    assert!(migrate_legacy_data(&data, &legacy, OLD_DB).unwrap());

    assert_eq!(read(&data.join(CURRENT_DB)), "banco");
    assert_eq!(read(&data.join(format!("{CURRENT_DB}-wal"))), "wal");
    assert_eq!(read(&data.join(format!("{CURRENT_DB}-shm"))), "shm");
    assert_eq!(read(&data.join("assets/foto.png")), "img");
    assert_eq!(read(&data.join("backups/b1.db")), "bkp");
    assert!(
        !legacy.exists(),
        "a pasta antiga some: foi movida, não copiada"
    );
    assert!(!data.join(OLD_DB).exists());
}

#[test]
fn sem_pasta_antiga_nao_faz_nada() {
    let root = tempdir().unwrap();

    let moved = migrate_legacy_data(
        &root.path().join("novo"),
        &root.path().join("antigo"),
        OLD_DB,
    )
    .unwrap();

    assert!(!moved);
    assert!(!root.path().join("novo").exists());
}

#[test]
fn pasta_antiga_sem_banco_e_deixada_em_paz() {
    let root = tempdir().unwrap();
    let legacy = root.path().join("antigo");
    write(&legacy.join("outra-coisa.txt"), "x");

    assert!(!migrate_legacy_data(&root.path().join("novo"), &legacy, OLD_DB).unwrap());
    assert!(legacy.join("outra-coisa.txt").exists());
}

#[test]
fn se_a_pasta_nova_ja_tem_banco_nada_e_tocado() {
    let root = tempdir().unwrap();
    let legacy = root.path().join("antigo");
    let data = root.path().join("novo");
    write(&legacy.join(OLD_DB), "velho");
    write(&data.join(CURRENT_DB), "atual");

    assert!(!migrate_legacy_data(&data, &legacy, OLD_DB).unwrap());

    assert_eq!(read(&data.join(CURRENT_DB)), "atual");
    assert_eq!(
        read(&legacy.join(OLD_DB)),
        "velho",
        "os dados antigos continuam intactos"
    );
}

#[test]
fn pasta_nova_ja_criada_vazia_recebe_os_itens_sem_sobrescrever() {
    let root = tempdir().unwrap();
    let legacy = root.path().join("antigo");
    let data = root.path().join("novo");
    write(&legacy.join(OLD_DB), "banco");
    write(&legacy.join("assets/a.png"), "a");
    write(&legacy.join("config.txt"), "antigo");
    write(&data.join("config.txt"), "novo");

    assert!(migrate_legacy_data(&data, &legacy, OLD_DB).unwrap());

    assert_eq!(read(&data.join(CURRENT_DB)), "banco");
    assert_eq!(read(&data.join("assets/a.png")), "a");
    assert_eq!(
        read(&data.join("config.txt")),
        "novo",
        "o que já existia não é sobrescrito"
    );
    assert_eq!(read(&legacy.join("config.txt")), "antigo");
}

#[test]
fn rodar_duas_vezes_e_seguro() {
    let root = tempdir().unwrap();
    let legacy = root.path().join("antigo");
    let data = root.path().join("novo");
    write(&legacy.join(OLD_DB), "banco");

    assert!(migrate_legacy_data(&data, &legacy, OLD_DB).unwrap());
    assert!(!migrate_legacy_data(&data, &legacy, OLD_DB).unwrap());

    assert_eq!(read(&data.join(CURRENT_DB)), "banco");
}

#[test]
fn procura_a_geracao_mais_nova_e_nao_mexe_na_mais_antiga() {
    let root = tempdir().unwrap();
    let data = root.path().join("dev.tramion.app");
    write(
        &root.path().join("dev.aesthetic.notes").join(OLD_DB),
        "recente",
    );
    write(&root.path().join("dev.aun.notes").join(OLDEST_DB), "antigo");

    let from = migrate_from_any_legacy(&data).unwrap();

    assert_eq!(from, Some("dev.aesthetic.notes"));
    assert_eq!(read(&data.join(CURRENT_DB)), "recente");
    assert_eq!(
        read(&root.path().join("dev.aun.notes").join(OLDEST_DB)),
        "antigo",
        "só uma geração é movida"
    );
}

#[test]
fn quem_so_tem_o_nome_mais_antigo_tambem_e_migrado() {
    let root = tempdir().unwrap();
    let data = root.path().join("dev.tramion.app");
    write(&root.path().join("dev.aun.notes").join(OLDEST_DB), "antigo");

    let from = migrate_from_any_legacy(&data).unwrap();

    assert_eq!(from, Some("dev.aun.notes"));
    assert_eq!(read(&data.join(CURRENT_DB)), "antigo");
}

#[test]
fn instalacao_nova_sem_nada_antigo_nao_migra() {
    let root = tempdir().unwrap();

    assert_eq!(
        migrate_from_any_legacy(&root.path().join("dev.tramion.app")).unwrap(),
        None
    );
}
