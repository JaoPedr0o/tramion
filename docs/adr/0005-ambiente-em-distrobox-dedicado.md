# 0005. Ambiente de desenvolvimento em distrobox dedicado

**Status:** Aceita

## Contexto

O sistema hospedeiro é imutável (Bazzite) e o objetivo é mantê-lo limpo. Tauri exige bibliotecas de
sistema e a toolchain do Rust, que sujariam o sistema base.

## Decisão

Container `aun` (distrobox, Ubuntu 24.04) exclusivo do projeto, separado de outros ambientes.
Rust via `rustup` (perfil mínimo, em `~/.cargo` e `~/.rustup`); Node vem do `nvm` compartilhado;
pnpm via `corepack`.

## Consequências

- O hospedeiro não é alterado; o container pode ser descartado e recriado.
- A pasta pessoal é compartilhada: `target/` e caches ocupam espaço fora do container.
- Em NVIDIA, o WebKit usa renderização por software dentro do container (aviso `libEGL`); funcional.
