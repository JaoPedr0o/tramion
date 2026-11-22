use crate::error::DbError;
use sha2::{Digest, Sha256};
use std::collections::HashSet;

/// Uma migração: um passo (para frente) que altera o esquema do banco.
#[derive(Debug, Clone, Copy)]
pub struct Migration {
    /// Começa em 1 e cresce de 1 em 1, dentro de cada módulo.
    pub version: u32,
    /// O SQL. Normalmente vem de `include_str!("migrations/0001_init.sql")`.
    pub sql: &'static str,
}

/// As migrações de UM módulo. `'static` significa "vive durante todo o programa": como o SQL
/// é embutido no binário, isso vale naturalmente.
#[derive(Debug, Clone, Copy)]
pub struct ModuleMigrations {
    pub module: &'static str,
    /// Módulos cujas migrações precisam rodar antes (espelha o `dependsOn` do TypeScript).
    pub depends_on: &'static [&'static str],
    pub migrations: &'static [Migration],
}

/// Impressão digital do SQL. Se alguém editar uma migração já aplicada, ela muda.
/// (Usamos SHA-256 e não o hasher padrão do Rust porque o resultado fica gravado no banco e
/// precisa ser estável entre versões do compilador.)
pub(crate) fn checksum(sql: &str) -> String {
    let digest = Sha256::digest(sql.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Valida os conjuntos de migrações e devolve-os na ordem de execução (dependências primeiro).
/// Função pura: não toca em banco nenhum, por isso é fácil de testar.
pub(crate) fn order_modules(sets: &[ModuleMigrations]) -> Result<Vec<&ModuleMigrations>, DbError> {
    let mut seen = HashSet::new();
    for set in sets {
        if !seen.insert(set.module) {
            return Err(DbError::DuplicateModule(set.module.to_string()));
        }
        validate_versions(set)?;
    }

    let mut order: Vec<&ModuleMigrations> = Vec::new();
    let mut done: HashSet<&str> = HashSet::new();
    let mut visiting: Vec<&str> = Vec::new();
    for set in sets {
        visit(set, sets, &mut order, &mut done, &mut visiting)?;
    }
    Ok(order)
}

fn validate_versions(set: &ModuleMigrations) -> Result<(), DbError> {
    for (index, migration) in set.migrations.iter().enumerate() {
        let expected = index as u32 + 1;
        if migration.version != expected {
            return Err(DbError::InvalidVersions {
                module: set.module.to_string(),
                reason: format!(
                    "esperava a versão {expected} na posição {}, mas encontrou {}",
                    index + 1,
                    migration.version
                ),
            });
        }
    }
    Ok(())
}

fn visit<'a>(
    set: &'a ModuleMigrations,
    all: &'a [ModuleMigrations],
    order: &mut Vec<&'a ModuleMigrations>,
    done: &mut HashSet<&'a str>,
    visiting: &mut Vec<&'a str>,
) -> Result<(), DbError> {
    if done.contains(set.module) {
        return Ok(());
    }
    if let Some(start) = visiting.iter().position(|m| *m == set.module) {
        let mut path: Vec<String> = visiting[start..].iter().map(|m| m.to_string()).collect();
        path.push(set.module.to_string());
        return Err(DbError::DependencyCycle(path));
    }

    visiting.push(set.module);
    for dependency in set.depends_on {
        let target = all
            .iter()
            .find(|candidate| candidate.module == *dependency)
            .ok_or_else(|| DbError::MissingDependency {
                module: set.module.to_string(),
                dependency: dependency.to_string(),
            })?;
        visit(target, all, order, done, visiting)?;
    }
    visiting.pop();

    done.insert(set.module);
    order.push(set);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Constantes (e não chamadas de função) para que `&[M1]` valha `'static`.
    const M1: Migration = Migration {
        version: 1,
        sql: "SELECT 1;",
    };
    const M2: Migration = Migration {
        version: 2,
        sql: "SELECT 1;",
    };
    const M3: Migration = Migration {
        version: 3,
        sql: "SELECT 1;",
    };

    fn set(
        module: &'static str,
        depends_on: &'static [&'static str],
        migrations: &'static [Migration],
    ) -> ModuleMigrations {
        ModuleMigrations {
            module,
            depends_on,
            migrations,
        }
    }

    fn names(order: Vec<&ModuleMigrations>) -> Vec<&'static str> {
        order.into_iter().map(|s| s.module).collect()
    }

    #[test]
    fn coloca_dependencias_antes() {
        let sets = [set("tasks", &["notes"], &[M1]), set("notes", &[], &[M1])];
        assert_eq!(names(order_modules(&sets).unwrap()), ["notes", "tasks"]);
    }

    #[test]
    fn rejeita_modulo_duplicado() {
        let sets = [set("notes", &[], &[M1]), set("notes", &[], &[M1])];
        assert!(matches!(
            order_modules(&sets),
            Err(DbError::DuplicateModule(_))
        ));
    }

    #[test]
    fn rejeita_dependencia_inexistente() {
        let sets = [set("tasks", &["fantasma"], &[M1])];
        assert!(matches!(
            order_modules(&sets),
            Err(DbError::MissingDependency { .. })
        ));
    }

    #[test]
    fn detecta_ciclo_e_mostra_o_caminho() {
        let sets = [
            set("a", &["b"], &[M1]),
            set("b", &["c"], &[M1]),
            set("c", &["a"], &[M1]),
        ];
        match order_modules(&sets) {
            Err(DbError::DependencyCycle(path)) => assert_eq!(path, ["a", "b", "c", "a"]),
            outro => panic!("esperava ciclo, veio {outro:?}"),
        }
    }

    #[test]
    fn exige_versoes_seguidas_a_partir_de_1() {
        let pulou = [set("notes", &[], &[M1, M3])];
        assert!(matches!(
            order_modules(&pulou),
            Err(DbError::InvalidVersions { .. })
        ));
        let comeca_em_2 = [set("notes", &[], &[M2])];
        assert!(matches!(
            order_modules(&comeca_em_2),
            Err(DbError::InvalidVersions { .. })
        ));
    }

    #[test]
    fn checksum_e_estavel_e_sensivel_a_mudancas() {
        assert_eq!(checksum("abc"), checksum("abc"));
        assert_ne!(checksum("abc"), checksum("abd"));
        // Valor conhecido do SHA-256 de "abc": garante que o formato não muda por acidente.
        assert_eq!(
            checksum("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
