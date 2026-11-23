# Arquitetura

## Ideia central

A modularidade que importa hoje é a de **compilação**: cada módulo é um pacote isolado com uma porta de
entrada pública, proibido de importar o interior dos outros. Plugins carregados em tempo de execução
ficam para o futuro e não são impedidos por este desenho.

## Estrutura de diretórios

```
tramion/
├─ apps/desktop/        App Tauri + React: a "composition root" que liga módulos ao core
│  └─ src-tauri/        Rust: janela, permissões, comandos e (futuramente) acesso ao SQLite
├─ packages/
│  ├─ contracts/        Só tipos e interfaces, sem lógica. Todos podem depender dele
│  ├─ core/             Registro de módulos, barramento de eventos, erros
│  ├─ ui/               (futuro) tokens, temas e componentes base
│  └─ infra-sqlite/     Crate Rust: abertura segura do SQLite, migrações por módulo e backup
├─ modules/             Funcionalidades do produto (notes, tasks, ...), cada uma um pacote
├─ docs/                Esta documentação e as ADRs
└─ tests/               Testes que atravessam módulos (integração/e2e)
```

| Diretório   | Finalidade                                                  | Pode depender de                        |
| ----------- | ----------------------------------------------------------- | --------------------------------------- |
| `contracts` | Tipos e interfaces compartilhados                           | nada                                    |
| `core`      | Mecanismos fundamentais de módulos, eventos e erros         | contracts                               |
| `ui`        | Sistema de design e componentes visuais                     | contracts                               |
| `infra-*`   | Persistência e integrações com o sistema operacional        | contracts, core                         |
| `modules/*` | Uma funcionalidade completa (domínio, aplicação, interface) | contracts, core, ui. Nunca outro módulo |
| `apps/*`    | Executáveis; montam o sistema                               | todos                                   |

Os conceitos Core / Modules / Infrastructure / Presentation do pedido original estão mapeados assim:
Core = `packages/core`; Modules = `modules/*`; Infrastructure = `packages/infra-*` e `src-tauri/`;
Presentation = `packages/ui` e a interface de cada módulo.
`core/` e `infrastructure/` **não** são pastas de topo para evitar duas formas de dizer "biblioteca compartilhada".

## Como os módulos conversam

Nunca por importação direta. Por **contratos** (tipos em `contracts`) e **eventos** (via barramento do
`core`). Se `tasks` precisa reagir a uma nota criada, ele escuta o evento `note.created`; não importa `notes`.

## Como as fronteiras são impostas

Pelo ESLint (`eslint-plugin-boundaries`), configurado em `eslint.config.js`, executado em `pnpm lint`.
Regras resumidas:

1. Entre pacotes do projeto só se importa pelo **nome do pacote** (`@tramion/core`), nunca por caminho relativo.
2. Cada tipo de pacote só pode importar os pacotes da tabela acima.
3. Imports dentro do mesmo pacote são livres.

O motivo técnico de a regra olhar o nome do pacote está em [ADR 0004](adr/0004-fronteiras-verificadas-por-lint.md).

## Camada Rust

Os crates Rust formam um **workspace do Cargo** (`Cargo.toml` na raiz): `apps/desktop/src-tauri` e
`packages/infra-sqlite` compartilham o `target/` e o `Cargo.lock`. Perfis de compilação (como
`[profile.release]`) só valem na raiz.

`tramion-infra-sqlite` não conhece nenhum módulo. Cada módulo entregará suas migrações
(`ModuleMigrations`) e o crate as aplica na ordem de `depends_on`, com backup e verificação de integridade.
Detalhes e garantias em [ADR 0008](adr/0008-persistencia-em-crates-rust-por-modulo.md).

## Segurança do Tauri

- **CSP restritiva** em `tauri.conf.json` (o template vem com a CSP desligada).
- **Permissões mínimas** em `capabilities/default.json`: apenas `core:default`.
- A interface só pode chamar comandos Rust explicitamente registrados. Hoje, nenhum.
