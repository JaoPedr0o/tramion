use serde_json::json;
use tramion_sync::{Record, apply, merge};

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

fn tomb(id: &str, at: i64, device: &str) -> Record {
    Record {
        deleted: true,
        payload: json!(null),
        ..rec(id, at, device, "")
    }
}

fn sorted(mut v: Vec<Record>) -> Vec<Record> {
    v.sort_by(|x, y| x.id.cmp(&y.id));
    v
}

/// Aplica a mescla nos dois lados e devolve os estados finais, ordenados.
fn sync(base: &[Record], a: &[Record], b: &[Record]) -> (Vec<Record>, Vec<Record>) {
    let m = merge(base, a, b);
    let (mut ra, mut rb) = (a.to_vec(), b.to_vec());
    apply(&mut ra, &m.for_a);
    apply(&mut rb, &m.for_b);
    (sorted(ra), sorted(rb))
}

#[test]
fn registro_novo_de_um_lado_vai_para_o_outro() {
    let (a, b) = sync(&[], &[rec("1", 10, "A", "x")], &[rec("2", 20, "B", "y")]);

    assert_eq!(a, b);
    assert_eq!(a.len(), 2);
}

#[test]
fn so_um_lado_mudou_vence_sem_conflito() {
    let base = [rec("1", 10, "A", "velho")];
    let m = merge(&base, &[rec("1", 30, "A", "novo")], &base);

    assert!(m.conflicts.is_empty());
    assert_eq!(m.for_b.apply, vec![rec("1", 30, "A", "novo")]);
    assert!(m.for_a.apply.is_empty());
}

#[test]
fn os_dois_mudaram_vence_o_mais_novo_e_o_outro_vira_copia_em_conflito() {
    let base = [rec("1", 10, "A", "velho")];
    let (a, b) = sync(
        &base,
        &[rec("1", 30, "A", "do A")],
        &[rec("1", 40, "B", "do B")],
    );

    assert_eq!(a, b, "os dois ficam iguais");
    assert_eq!(a.len(), 2);
    assert_eq!(
        a.iter().find(|r| r.id == "1").unwrap().payload,
        json!({"text": "do B"})
    );
    let copia = a.iter().find(|r| r.id != "1").unwrap();
    assert_eq!(copia.payload, json!({"text": "do A"}), "nada se perde");
    assert!(copia.id.starts_with("1~conflito~"));
}

#[test]
fn empate_de_hora_desempata_pelo_aparelho_igual_nos_dois_lados() {
    let base = [rec("1", 10, "A", "v")];
    let x = [rec("1", 50, "A", "a")];
    let y = [rec("1", 50, "B", "b")];

    let (a1, b1) = sync(&base, &x, &y);
    let (b2, a2) = sync(&base, &y, &x);

    assert_eq!(a1, b1);
    assert_eq!(a1, a2, "trocar quem é local não muda o resultado");
    assert_eq!(b1, b2);
    assert_eq!(a1.iter().find(|r| r.id == "1").unwrap().device, "B");
}

#[test]
fn apagamento_mais_novo_vence_a_edicao_mais_velha() {
    let base = [rec("1", 10, "A", "v")];
    let (a, b) = sync(&base, &[rec("1", 20, "A", "editou")], &[tomb("1", 30, "B")]);

    assert_eq!(a, b);
    assert_eq!(a.len(), 1);
    assert!(a[0].deleted);
}

#[test]
fn edicao_mais_nova_ressuscita_o_registro_apagado() {
    let base = [rec("1", 10, "A", "v")];
    let (a, b) = sync(&base, &[rec("1", 40, "A", "voltou")], &[tomb("1", 30, "B")]);

    assert_eq!(a, b);
    assert!(!a[0].deleted);
    assert_eq!(a[0].payload, json!({"text": "voltou"}));
}

#[test]
fn registros_iguais_nao_geram_trabalho() {
    let r = [rec("1", 10, "A", "x")];
    let m = merge(&r, &r, &r);

    assert!(m.for_a.apply.is_empty() && m.for_b.apply.is_empty() && m.conflicts.is_empty());
}

#[test]
fn sincronizar_de_novo_depois_de_mesclar_nao_muda_mais_nada() {
    let base = [rec("1", 10, "A", "v")];
    let (a, b) = sync(
        &base,
        &[rec("1", 30, "A", "do A")],
        &[rec("1", 40, "B", "do B")],
    );

    let m = merge(&a, &a, &b);

    assert!(
        m.for_a.apply.is_empty() && m.for_b.apply.is_empty(),
        "idempotente"
    );
}

#[test]
fn primeiro_encontro_sem_base_trata_diferentes_como_conflito() {
    let (a, b) = sync(
        &[],
        &[rec("1", 30, "A", "do A")],
        &[rec("1", 40, "B", "do B")],
    );

    assert_eq!(a, b);
    assert_eq!(a.len(), 2, "a edição perdedora virou cópia");
}
