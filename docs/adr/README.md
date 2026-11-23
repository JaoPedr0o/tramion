# Decisões arquiteturais (ADRs)

Cada decisão importante vira um arquivo numerado, com contexto, decisão e consequências.
Decisões não são apagadas: se mudarem, uma nova ADR a substitui e a antiga é marcada como _substituída_.

| #                                                          | Decisão                                                           | Status |
| ---------------------------------------------------------- | ----------------------------------------------------------------- | ------ |
| [0001](0001-monorepo-com-pnpm-workspaces.md)               | Monorepo com pnpm workspaces                                      | Aceita |
| [0002](0002-stack-tauri-react-typescript-sqlite.md)        | Stack: Tauri, React, TypeScript e SQLite                          | Aceita |
| [0003](0003-sqlite-acessado-pelo-rust.md)                  | SQLite acessado pelo Rust (`rusqlite`)                            | Aceita |
| [0004](0004-fronteiras-verificadas-por-lint.md)            | Fronteiras de módulo verificadas por lint                         | Aceita |
| [0005](0005-ambiente-em-distrobox-dedicado.md)             | Ambiente de desenvolvimento em distrobox dedicado                 | Aceita |
| [0006](0006-css-com-variaveis.md)                          | Estilo: CSS com variáveis (tokens)                                | Aceita |
| [0007](0007-barramento-de-eventos-tipado-e-sincrono.md)    | Barramento de eventos tipado e síncrono                           | Aceita |
| [0008](0008-persistencia-em-crates-rust-por-modulo.md)     | Persistência: infraestrutura em crate Rust e migrações por módulo | Aceita |
| [0009](0009-desenho-do-modulo-de-notas.md)                 | Desenho do módulo de notas (fatia vertical)                       | Aceita |
| [0010](0010-extensibilidade-provada-com-segundo-modulo.md) | Extensibilidade provada com um segundo módulo                     | Aceita |
| [0011](0011-hierarquia-de-paginas.md)                      | Hierarquia de páginas (páginas dentro de páginas)                 | Aceita |
| [0012](0012-editor-de-blocos-e-subpaginas-como-link.md)    | Editor de blocos (BlockNote) e subpáginas como link               | Aceita |
| [0013](0013-incorporacoes-icone-capa-e-codigo.md)          | Incorporações, ícone e capa de página, e linguagem do código      | Aceita |
| [0014](0014-bases-de-dados.md)                             | Bases de dados (tabela)                                           | Aceita |
| [0015](0015-nome-identidade-visual-e-instalacao.md)        | Nome, identidade visual e instalação                              | Aceita |
