# 0008. Persistência: infraestrutura em crate Rust e migrações por módulo

**Status:** Aceita

## Contexto

Cada módulo deve ser dono das suas tabelas e migrações, mas o SQL roda em Rust (ADR 0003) e o processo
é um só. Opções avaliadas: (A) arquivos `.sql` por módulo embutidos no app; (B) migrações enviadas pelo
TypeScript; (C) um crate Rust por módulo; (D) pasta central de migrações.

## Decisão

**Opção C, em duas fases.**

1. `packages/infra-sqlite` (crate `aesthetic-infra-sqlite`): infraestrutura que **não conhece nenhum módulo**.
   Recebe `ModuleMigrations` (módulo, `depends_on`, lista de migrações) e cuida do resto.
2. Cada módulo ganhará o seu crate Rust (`modules/<nome>/rust/`) com migrações e comandos, e o app só
   junta as peças. Será validado com o módulo de notas (etapa 5); se for pesado demais, recuamos para a
   opção A, pois a infraestrutura é a mesma.

B foi descartada por contradizer a ADR 0003 (o frontend passaria a enviar SQL). D, por tirar do
módulo a posse das próprias tabelas.

## Garantias da infraestrutura (todas cobertas por testes)

- Migrações **só para frente**, cada uma em **transação** (ou entra inteira, ou nada muda).
- Tabela `_migrations` com módulo, versão e **checksum SHA-256**: editar uma migração já aplicada é recusado.
- Banco **mais novo que o app** (migração desconhecida) é recusado.
- Ordem de execução segue `depends_on`, validada **antes** de criar ou tocar o arquivo.
- **Backup consistente** (`VACUUM INTO`) antes de migrar um banco que já tenha dados, mantendo os N mais recentes.
- `PRAGMA integrity_check` ao abrir; arquivo que não é banco é recusado **sem ser modificado**.
- WAL, chaves estrangeiras ligadas e `busy_timeout`.

## Consequências

- Versões das migrações de cada módulo: 1, 2, 3... sem buracos (validado).
- Dependências novas: `rusqlite` (feature `bundled`: compila o SQLite junto, sem depender do sistema) e
  `sha2`; em testes, `tempfile`.
- No Rust não há ESLint: a fronteira entre módulos é o `Cargo.toml` (o Cargo recusa importar um crate
  não declarado).
- A build `bundled` liga as chaves estrangeiras por padrão; o PRAGMA explícito é redundante hoje e foi
  mantido por segurança (o teste correspondente não distingue as duas situações).
- Os testes foram validados quebrando o código de propósito (5 mutações, 4 detectadas; a 5ª é o caso acima).
