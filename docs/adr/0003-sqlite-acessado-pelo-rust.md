# 0003. SQLite acessado pelo Rust (`rusqlite`)

**Status:** Aceita

## Contexto

Duas opções: (A) `tauri-plugin-sql`, com SQL escrito no frontend; (B) `rusqlite` no backend Rust,
com o frontend chamando comandos (`invoke`).

## Decisão

**Opção B.** O frontend nunca vê SQL: ele pede ações (`notes_create`) e o Rust valida e persiste.

## Motivos

- A fronteira entre interface e dados é real, não uma convenção. Isso sustenta a modularidade.
- Segurança: uma falha na interface não ganha poder de executar SQL arbitrário.
- Migrações e integridade ficam no lado confiável, que o frontend não consegue contornar.
- Testes do acesso a dados rodam em Rust, sem janela nem navegador.

## Consequências

- Custo inicial maior: é preciso escrever comandos em Rust.
- Mudar para a opção A depois exigiria reescrever o acesso a dados.
