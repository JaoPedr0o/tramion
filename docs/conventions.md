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
- **Imports relativos com extensão** (`./errors.ts`): o resolvedor do plugin de fronteiras só encontra
  o arquivo assim. Um import relativo sem extensão para outro pacote escaparia da regra (ADR 0004).
- **Rust:** formatado com `cargo fmt` e sem avisos do `cargo clippy -D warnings`. Erros são valores
  (`Result<T, E>` com um `enum` por crate); evitar `unwrap()` fora de testes. Testes de API pública em
  `tests/`, de lógica interna em `#[cfg(test)]`.
- **Testes que protegem de verdade:** ao escrever uma verificação, quebre o código de propósito e
  confirme que ela falha. Verificação que nunca falhou não prova nada.
- **Vitest: o que um `beforeEach` devolve é executado como função de limpeza.** Use chaves
  (`beforeEach(() => { mock.mockReset(); })`); um arrow function que devolve o mock o chamaria depois de cada teste.
- **Eventos entre módulos:** levam só o `id`, são publicados depois da confirmação da operação e ficam em
  `packages/contracts/src/events/`.
