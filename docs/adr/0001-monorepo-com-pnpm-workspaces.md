# 0001. Monorepo com pnpm workspaces

**Status:** Aceita

## Contexto

O projeto terá vários pacotes independentes (core, contracts, módulos, app) que precisam evoluir juntos.

## Decisão

Um único repositório com **pnpm workspaces** (`apps/*`, `packages/*`, `modules/*`).
Alternativa considerada: `npm workspaces`, que já vem com o Node, mas deixa passar dependências
"fantasmas" (usar um pacote que não foi declarado), o que enfraquece justamente o isolamento que buscamos.

## Consequências

- Cada pacote declara explicitamente suas dependências; o pnpm bloqueia o resto.
- Exige instalar o pnpm (via `corepack`, que já vem com o Node).
