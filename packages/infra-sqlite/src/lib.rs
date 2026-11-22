//! Infraestrutura de persistência SQLite.
//!
//! Este crate **não conhece nenhum módulo do produto**. Cada módulo entrega a sua lista de
//! migrações (`ModuleMigrations`) e este crate cuida do resto: abrir o banco com segurança,
//! aplicar as migrações pendentes na ordem certa, fazer backup antes e recusar bancos suspeitos.

mod backup;
mod database;
mod error;
mod migration;

pub use database::{Database, OpenOptions};
pub use error::DbError;
pub use migration::{Migration, ModuleMigrations};
