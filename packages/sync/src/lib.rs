//! Motor de sincronização entre aparelhos (ADR 0020, fase 2).
//!
//! É puro: não conhece rede nem banco. Recebe o que dois aparelhos têm e diz o que cada um deve aplicar para os dois
//! ficarem iguais. Regras:
//! - Cada registro tem um `id`, a hora da última edição (`updated_at`, em ms), o aparelho que o editou e, se foi
//!   apagado, `deleted = true` (a "lápide"), para o apagamento também se espalhar.
//! - Só um lado mudou desde o último encontro: o mais novo vence, sem conflito.
//! - Os dois lados mudaram o mesmo registro: vence a edição mais recente e a outra vira uma **cópia em conflito**
//!   (novo registro), para nada se perder. Empate de hora desempata pelo id do aparelho, igual nos dois lados.
//! - Edição vence apagamento só se for mais nova que ele; se o apagamento é mais novo, o registro some.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Um registro sincronizável.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Record {
    pub id: String,
    /// A qual conjunto pertence (por exemplo, `note`, `cell`).
    pub kind: String,
    pub updated_at: i64,
    /// Aparelho que fez a última edição.
    pub device: String,
    pub deleted: bool,
    /// Conteúdo (JSON). Vazio (`null`) numa lápide.
    pub payload: serde_json::Value,
}

/// O que um lado deve fazer para ficar igual ao outro.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Plan {
    /// Registros a gravar (novos ou substituindo o de mesmo id).
    pub apply: Vec<Record>,
}

/// O resultado da mescla entre o aparelho local (`a`) e o remoto (`b`).
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Merge {
    pub for_a: Plan,
    pub for_b: Plan,
    /// Cópias em conflito criadas (já incluídas nos dois planos).
    pub conflicts: Vec<Record>,
}

/// O registro que prevalece entre dois com o mesmo id: o mais novo; no empate, o do maior id de aparelho.
fn winner<'a>(x: &'a Record, y: &'a Record) -> &'a Record {
    if (x.updated_at, &x.device) >= (y.updated_at, &y.device) {
        x
    } else {
        y
    }
}

/// Id da cópia em conflito: determinístico, para os dois aparelhos chegarem ao mesmo id sem conversar.
pub fn conflict_id(original: &str, loser: &Record) -> String {
    format!("{original}~conflito~{}~{}", loser.device, loser.updated_at)
}

/// Mescla os registros de dois aparelhos. `base` é o que ambos tinham no último encontro (vazio no primeiro): serve
/// para saber se **os dois** mudaram um registro (conflito) ou só um. A função é simétrica: trocar `a` e `b` troca
/// os planos e não muda o resultado.
pub fn merge(base: &[Record], a: &[Record], b: &[Record]) -> Merge {
    let index = |records: &[Record]| -> BTreeMap<String, Record> {
        records.iter().map(|r| (r.id.clone(), r.clone())).collect()
    };
    let (base, a, b) = (index(base), index(a), index(b));
    let mut ids: Vec<&String> = a.keys().chain(b.keys()).collect();
    ids.sort();
    ids.dedup();

    let mut out = Merge::default();
    for id in ids {
        match (a.get(id), b.get(id)) {
            (Some(x), None) => out.for_b.apply.push(x.clone()),
            (None, Some(y)) => out.for_a.apply.push(y.clone()),
            (Some(x), Some(y)) if x == y => {}
            (Some(x), Some(y)) => {
                let changed = |r: &Record| base.get(id).is_none_or(|old| old != r);
                let win = winner(x, y).clone();
                let lose = if std::ptr::eq(winner(x, y), x) { y } else { x };
                // Conflito de verdade: os dois mudaram, os conteúdos diferem, e quem perde ainda tem algo a salvar.
                let both_changed = changed(x) && changed(y);
                if both_changed && !lose.deleted && !win.deleted && lose.payload != win.payload {
                    let copy = Record {
                        id: conflict_id(id, lose),
                        updated_at: lose.updated_at,
                        ..lose.clone()
                    };
                    out.for_a.apply.push(copy.clone());
                    out.for_b.apply.push(copy.clone());
                    out.conflicts.push(copy);
                }
                if &win != x {
                    out.for_a.apply.push(win.clone());
                }
                if &win != y {
                    out.for_b.apply.push(win);
                }
            }
            (None, None) => unreachable!(),
        }
    }
    out
}

/// Aplica um plano a um conjunto de registros (útil para testes e para o aparelho montar o estado final).
pub fn apply(records: &mut Vec<Record>, plan: &Plan) {
    for new in &plan.apply {
        match records.iter_mut().find(|r| r.id == new.id) {
            Some(slot) => *slot = new.clone(),
            None => records.push(new.clone()),
        }
    }
}
