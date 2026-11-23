# 0004. Fronteiras de módulo verificadas por lint

**Status:** Aceita

## Contexto

Sem verificação automática, a separação entre módulos vira convenção e se desfaz aos poucos.

## Decisão

Usar `eslint-plugin-boundaries` (v7) com a regra `boundaries/dependencies`, em `eslint.config.js`.
Regras: ver `docs/architecture.md`.

## Descoberta importante (como a regra funciona de verdade)

A primeira versão da configuração, escrita por diretório, **parecia correta e não protegia nada**.
Só percebemos porque testamos com imports proibidos de propósito.

Motivo: o pnpm liga pacotes do workspace por link simbólico, e o plugin resolve `@tramion/core` para
`packages/contracts/node_modules/@tramion/core/src/index.ts`. Esse caminho começa com `packages/contracts`,
então o plugin entende que o pacote está importando a si mesmo e libera.

Correção:

1. Regras escritas pelo **nome do pacote** (`to.module.source`), não pelo diretório.
2. `checkAllOrigins: true` (por padrão só imports locais são conferidos) e `checkInternals: true`.
3. Import **relativo** que sai do pacote é sempre proibido; para cruzar, usa-se o nome do pacote.
4. O plugin usa o resolvedor `eslint-import-resolver-node`, que lê `main` e **não** `exports`;
   por isso todo pacote declara `main` além de `exports`.
5. Em `boundaries/dependencies`, **a última política que casa vence**; a ordem importa.

## Consequências

- Violações viram erros de `pnpm lint` (editor e CI).
- `tests/architecture/boundaries.test.ts` roda o ESLint em arquivos virtuais com imports proibidos e
  permitidos. Foi validado desligando `checkAllOrigins` de propósito: o teste falhou, como deveria.
- Imports relativos precisam da extensão `.ts` para o plugin resolvê-los (ver `docs/conventions.md`).
