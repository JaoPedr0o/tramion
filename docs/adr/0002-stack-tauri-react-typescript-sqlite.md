# 0002. Stack: Tauri, React, TypeScript e SQLite

**Status:** Aceita

## Contexto

Aplicativo desktop local-first, pequeno e seguro, sem backend remoto.

## Decisão

- **Tauri 2** para a casca desktop (usa o WebView do sistema; binário pequeno; backend em Rust).
- **React 19 + TypeScript** para a interface.
- **SQLite** para persistência local (um arquivo, sem servidor, offline).

## Consequências

- O backend nativo é Rust; é preciso aprender o básico da linguagem.
- No Linux, depende de bibliotecas de sistema (WebKitGTK); ver `docs/development.md`.
