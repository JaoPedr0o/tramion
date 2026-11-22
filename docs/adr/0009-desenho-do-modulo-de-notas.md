# 0009. Desenho do módulo de notas (fatia vertical)

**Status:** Aceita

## Contexto

O módulo de notas é o primeiro e deve provar que a arquitetura modular funciona de ponta a ponta.

## Decisões

1. **Fatia vertical:** cada módulo tem lado TypeScript (`src/`: domain, application, infrastructure, ui)
   e lado Rust (`rust/`: migrações, repositório, comandos). O app só junta as peças.
2. **Cada módulo Rust é um plugin do Tauri** (`plugin:notes|<comando>`). Comandos e **permissões** ficam
   dentro do módulo (`notes:allow-list`...); o app escolhe o que habilitar em `capabilities/default.json`.
   Alternativa descartada: lista central de comandos no app (o app passaria a conhecer cada comando e as
   permissões seriam mantidas à mão).
3. **Exclusão reversível:** coluna `deleted_at` (lixeira). Um app local, sem nuvem, não deve apagar sem volta.
4. **IDs gerados pelo SQLite** (`randomblob(16)`, 32 hexadecimais): sem dependência nova.
5. **Quem valida é o Rust.** O banco também se defende (`CHECK` no título). A interface não duplica regras:
   recebe códigos de erro estáveis e os traduz em mensagens.
6. **Eventos levam só o `id`** (`note.created`...), nunca a nota inteira, para não vazar o modelo do módulo
   nem entregar dados que ficam velhos.
7. **Telas por contrato:** o módulo registra uma `ViewContribution` no `ViewRegistry` (em `contracts`/`core`);
   a barra lateral do app lista as telas sem conhecer o módulo.
8. **Texto simples** no corpo. Blocos independentes serão avaliados depois de validada a fundação.
9. **Comandos `async`:** comandos síncronos do Tauri rodam na thread da janela e a travariam durante o SQLite.
10. **Gateway injetável:** a aplicação depende de uma interface (`NotesGateway`); o Tauri a cumpre no app e
    um falso a cumpre nos testes.

## Consequências

- `contracts` importa o **tipo** `ComponentType` do React (apenas tipo, `@types/react` como devDependency).
- O `infra-sqlite` reexporta o `rusqlite` para que todos usem a mesma versão.
- Migração aplicada **não pode ser editada** (checksum). Em desenvolvimento, apagar o banco local recria tudo.
- O app ligou-se ao módulo em dois pontos apenas: `bootstrap.ts` (TypeScript) e `src-tauri/src/lib.rs` (Rust).
