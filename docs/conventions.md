# Convenções

- **TypeScript estrito** (`tsconfig.base.json`): inclui `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`.
- **Nomes de pacotes:** `@aun/<nome>`. Todo pacote declara `main` e `exports` apontando para `src/index.ts`
  (ver ADR 0004 sobre o porquê do `main`).
- **API pública:** o que não está exportado em `src/index.ts` de um pacote é privado.
- **Interface:** estilos via variáveis de `src/styles/tokens.css`. Nada de cores ou espaçamentos soltos.
- **Formatação:** Prettier (`pnpm format`). Fim de linha LF, 2 espaços (Rust: 4).
- **Testes:** `*.test.ts` ao lado do código; testes que cruzam módulos ficam em `tests/`.
- **Commits:** mensagens curtas e descritivas, em português, no imperativo.
- **Dependências:** justificar antes de adicionar. Preferir poucas, pequenas e bem mantidas.
