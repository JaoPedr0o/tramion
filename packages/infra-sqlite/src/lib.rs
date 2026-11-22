//! Infraestrutura de persistência SQLite.
//!
//! Este crate **não conhece nenhum módulo do produto**. Cada módulo entrega a sua lista de
//! migrações (`ModuleMigrations`) e este crate cuida do resto: abrir o banco com segurança,
//! aplicar as migrações pendentes na ordem certa, fazer backup antes e recusar bancos suspeitos.

mod backup;
mod database;
mod error;
mod migration;

/// Reexportado para que os módulos usem EXATAMENTE a mesma versão do `rusqlite` que este crate usa
/// (duas versões gerariam dois tipos `Connection` incompatíveis).
pub use rusqlite;

pub use database::{Database, OpenOptions, SharedDatabase};
pub use error::DbError;
pub use migration::{Migration, ModuleMigrations};
