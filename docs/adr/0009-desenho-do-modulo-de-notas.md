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

## Atualização (passo 5b): regras do serviço Rust

11. **Concorrência otimista.** `update` exige o `updatedAt` que quem edita viu; se a nota mudou desde então,
    o Rust recusa com `notes.conflict` em vez de sobrescrever. Protege, sobretudo, o salvamento automático
    disputando consigo mesmo.
12. **A versão (`updated_at`) sempre aumenta:** o novo valor é `max(agora, anterior + 1)`. Sem isso, duas edições
    no mesmo milissegundo repetiriam a versão e a checagem de conflito deixaria passar uma edição velha.
13. **Fixar, excluir e restaurar não mudam `updated_at`:** organizar não é editar o conteúdo, e não pode causar
    conflito em quem está com a nota aberta.
14. **Lixeira:** `delete` e `restore` são idempotentes (repetir não é erro); só nota inexistente é erro.
    `purge` (apagar de vez) só vale para nota que já está na lixeira: uma nota ativa nunca se perde por engano.
15. **Título:** espaços das pontas são removidos e o limite (200) conta **caracteres**, não bytes.
16. **Camadas no Rust:** `repository` só tem SQL; `service` tem as regras e os erros; `commands` só traduz
    entre o Tauri e o serviço. Códigos de erro (`notes.*`) são estáveis e cobertos por teste.

## Atualização (passo 5c): serviço de aplicação e eventos

17. **Evento só depois da confirmação.** Cada operação espera o Rust confirmar e só então publica; se o Rust
    rejeitar, o erro sobe intacto e **nenhum** evento é publicado. Quem escuta nunca reage a algo que não aconteceu.
18. **Cinco eventos** (em `contracts/src/events/notes.ts`), todos só com o `id`: `note.created`, `note.updated`
    (edição ou fixar/desafixar), `note.deleted` (lixeira), `note.restored` e `note.purged` (apagar de vez).
    `restored` e `purged` existem porque, sem eles, quem escuta ficaria com a lista velha.
19. **`AppEvents` é a união dos eventos de cada módulo** (`type AppEvents = NotesEvents & ...`), um arquivo por módulo.
20. **Assinante com defeito não derruba a operação:** vale a garantia do barramento (ADR 0007), coberta por teste.
21. **O que vem do Rust é dado não confiável.** O adaptador converte qualquer rejeição em `NotesError`; um código
    desconhecido (ou algo que não seja o formato esperado) vira `notes.internal` e nunca é repassado cru.
22. **Sem validação duplicada em TypeScript:** o serviço só orquestra; as regras são do Rust.

## Atualização (passo 5d): interface

23. **Salvamento automático com pausa de 500 ms**, em uma lógica independente do React (`note-autosaver`),
    testável com relógio falso. Regra central: **nunca dois salvamentos ao mesmo tempo**. Cada salvamento troca a
    versão da nota; um segundo, enviado com a versão antiga, seria recusado como conflito falso contra a própria
    pessoa. Enquanto um salvamento está em andamento, o seguinte espera e sai com a versão nova.
24. **Conflito nunca perde nem sobrescreve texto em silêncio.** O editor mantém o texto digitado, pausa o
    salvamento e mostra um aviso com duas escolhas explícitas: _manter o meu texto_ (salva por cima, por decisão
    do usuário) ou _carregar a versão salva_ (descarta o texto digitado).
25. **Trocar de nota ou fechar a tela salva antes** o que estiver pendente (`close()` do salvador).
26. **A lista se atualiza sozinha** escutando os eventos `note.*` do próprio módulo: a tela não precisa lembrar de
    "atualizar a lista" depois de cada ação, e ações vindas de outro lugar também aparecem.
27. **Apagar de vez pede confirmação** na própria tela (dois passos), em vez de `window.confirm`, que não é
    confiável no WebView do Tauri. Excluir (lixeira) não pede, por ser reversível.
28. **Textos ao usuário vêm do código do erro**, nunca do texto técnico do Rust (`ui/messages.ts`).
29. **Atalho:** Ctrl+N cria uma nota. Acessibilidade básica: rótulos nos campos, `role="status"` no estado do
    salvamento, `role="alert"` nos avisos, foco visível e `aria-current`/`aria-pressed` nos controles.

## Testes de interface

`jsdom` + Testing Library + user-event (devDependencies de teste, justificadas: pequenas e muito consolidadas).
Os testes usam um **gateway falso em memória que imita as regras do Rust**. É uma imitação: se o Rust mudar,
ela precisa acompanhar. A prova de verdade é rodar o app.
