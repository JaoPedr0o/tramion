# 0022. Módulo Foco (pomodoro e hábitos)

**Status:** Aceita (primeira versão: pomodoro e hábitos; estudo e estatísticas ficam para depois)

## Contexto

O Tramion é um app de notas e bases de dados. Queremos um espaço para hábitos, pomodoro e, mais adiante, estudo, que o Notion
não tem, mas **sem atrapalhar**: nada de pergunta, aviso ou janela ao abrir o app (por exemplo, nunca um "como foi seu dia?"
sozinho). Tudo é sutil e só existe para quem for procurar. Notificações só para o que a pessoa ligar.

## Decisões

### Um módulo próprio, separado das notas

`modules/focus` (TypeScript: `domain`, `application`, `infrastructure`, `ui`) e `modules/focus/rust` (crate `tramion-focus`,
plugin `focus` do Tauri, com `build.rs`, permissões e migrações próprias). Não importa o módulo de notas (a regra do
`eslint-plugin-boundaries` barra, e há teste em `tests/architecture`). A página de notas associada a uma sessão é só um
**id de texto**, sem chave estrangeira: a página pode ser apagada e a sessão continua valendo.

### Encaixe na casca: uma segunda "tela" no `ViewRegistry`

O módulo registra **uma** tela, `focus` ("Foco"). A casca (`App.tsx`) já lista as telas no seletor "Telas" da barra lateral
quando há mais de uma; então a entrada do Foco é um item discreto ali, ao lado de "Páginas", sem selo, sem destaque e sem
contador. A tela padrão continua sendo a primeira registrada (notas): o Foco é registrado **depois** em `bootstrap.ts`.
Alternativas descartadas: botão dentro da barra lateral das notas (exigiria o módulo de notas conhecer o Foco ou um contrato
novo) e rota própria (a casca não tem roteador).

Mudanças na casca, as menores possíveis: uma linha em `bootstrap.ts`, o plugin e as migrações em `src-tauri/src/lib.rs`, a
permissão `focus:default` em `capabilities/default.json`, a dependência em `Cargo.toml`/`package.json`, e um ajuste em
`App.tsx` para a gaveta do celular fechar ao escolher uma tela no seletor (antes o seletor nunca aparecia, pois só havia uma
tela).

Ao trocar de tela, o módulo de notas é desmontado e o Foco montado (e vice-versa). Por isso o estado do Foco (cronômetro,
hábitos) mora em **stores do módulo**, fora dos componentes.

### Dados (SQLite, via Rust)

Migração 1 do módulo `focus` (versões próprias): `focus_habit`, `focus_habit_check`, `focus_session`, `focus_setting`. Todas
com **id de texto aleatório** (32 hex, gerado pelo SQLite) e **`updated_at` em milissegundos** (a `focus_setting` usa a chave
como id). O Rust valida tudo (nome, símbolo, frequência, data AAAA-MM-DD real, duração da sessão, limites dos ajustes);
erros saem com código estável (`focus.*`) e a interface traduz em mensagem.

- **Marcação do dia:** `day` é a data **local** (AAAA-MM-DD), decidida por quem marca; assim o dia não "anda" se o aparelho mudar
  de fuso. Marcar é idempotente; desmarcar apaga a linha. `UNIQUE (habit_id, day)`.
- **Arquivar** não apaga: o histórico fica e some só da lista (há "Mostrar arquivados"). Hábito arquivado não aceita marcação.
- **Sessões:** só as de foco concluídas são registradas (início, duração planejada e, opcionalmente, o id da página). Cancelar
  não registra nada.
- **Ajustes** do pomodoro em `focus_setting`: 25/5 por padrão; pausa longa opcional (a cada 2 a 12 sessões, desligada por
  padrão); aviso do sistema **desligado por padrão**.

### Lógica pura e testada

- `domain/day.ts`: dia local por fuso (`Intl`), aritmética de datas em UTC (sem surpresa de horário de verão).
- `domain/streak.ts`: sequência atual e melhor. "Todo dia": um dia anterior em branco quebra; **hoje ainda aberto não quebra**.
  "Dias úteis": sábado e domingo são folga (marcados, contam como bônus). "N vezes por semana": a sequência é de **semanas**
  (segunda a domingo) com pelo menos N marcas; a semana corrente aberta não quebra.
- `domain/heatmap.ts`: grade de 26 semanas (≈ 6 meses), colunas de segunda a domingo, intensidade pela fração de hábitos
  feitos no dia.
- `domain/pomodoro.ts`: cronômetro como dado. O restante vem da **hora de término** (`endsAt`), nunca de contagem de ticks;
  pausar guarda o restante, retomar recalcula o término; se o relógio do sistema andar para trás, o restante não passa da
  duração. O store agenda `setTimeout` até o término e a tela também confere o relógio a cada 0,5 s e ao voltar o foco da
  janela (janelas ocultas atrasam temporizadores); a sessão é concluída uma única vez, qualquer que seja o caminho.

### Porta da plataforma

`FocusPlatform.notify` é injetada (implementada com `@tauri-apps/plugin-notification`, já presente no app). O módulo não
importa a porta do módulo de notas; a duplicação é de poucas linhas e mantém os módulos independentes. O aviso do sistema só
sai se a pessoa ligar em "Ajustes do pomodoro". Dentro da tela, o fim sempre aparece (região `role="status"`).

### Interface

Duas abas (Pomodoro, Hábitos). Botões com peso 600 e alvos de 44 px; diálogo de hábito com cabeçalho e rodapé fixos e miolo
rolável, que vira folha de tela cheia no celular, com margens seguras (`--safe-*` quando existirem, com `env(safe-area-inset-*)`
de reserva). CSS próprio em `modules/focus/src/ui/focus.css`, só com tokens do app (tema claro e escuro). Acessibilidade:
`tablist`/`tab`/`tabpanel` com setas, `role="timer"`, `aria-pressed` nas marcações, diálogo modal com foco preso, devolvido ao
fechar, e Esc.

## Limites desta versão

- O cronômetro vive na memória do app: **fechar o app encerra** a sessão em andamento (nada é registrado). Retomar depois de
  reabrir fica para depois.
- A interface ainda **não oferece escolher a página associada** à sessão (o campo existe no banco, no Rust e no store).
  Falta um contrato em `packages/contracts` com "página aberta agora" (por exemplo, um evento `note.opened`) para o Foco
  sugerir a página sem importar as notas.
- O mapa de calor é geral (todos os hábitos ativos); o de um hábito só fica para depois.
- A sequência é calculada na interface a partir de **todo** o histórico de marcações (poucas linhas por hábito).
- Hábitos não têm reordenação nem exclusão definitiva (só arquivar).
- Não testado em aparelho real (celular): só há testes automatizados.

## Sincronização (NÃO faz parte desta versão)

As tabelas já têm id de texto e `updated_at` em ms. Para sincronizar o Foco entre PC e celular falta, **espelhando o que a
migração 0013 fez para as notas**:

1. Uma tabela `focus_sync_state (kind, id, updated_at, device, deleted)` e **gatilhos** `AFTER INSERT/UPDATE/DELETE` em
   `focus_habit`, `focus_habit_check` (id composto `habit_id:day`), `focus_session` e `focus_setting`, respeitando o marcador
   `sync_applying` e o `device_id` (hoje em `notes_meta`, que o Foco não deve ler: mover para um lugar comum ou duplicar).
2. Novos tipos (`habit`, `check`, `session`, `setting`) em `sync_io` do módulo de notas (ou, melhor, um registro de "fontes de
   sincronização" por módulo, para o crate de notas não conhecer o Foco).
3. Regras de mescla: marcação e sessão são "adicionar vence" (sem conflito real); hábito e ajuste, "última edição vence". Como
   desmarcar apaga a linha, a lápide de `focus_sync_state` é o que faz a desmarcação chegar ao outro aparelho.
4. A ordem de aplicação respeita a chave estrangeira (`habit` antes de `check`).

## Próximos passos

1. **Estudo e revisão espaçada** (matérias, sessões ligadas a uma matéria, revisões agendadas), reaproveitando `focus_session`
   (nova coluna de matéria por migração).
2. **Estatísticas:** tempo de foco por dia/semana, melhor horário, constância por hábito.
3. **Diário e humor** opcionais, **sempre iniciados pela pessoa** (nunca uma pergunta ao abrir o app).
4. **Metas** (por exemplo, sessões por dia) e lembretes, **apenas se a pessoa ligar**.
5. **Sincronização** (seção acima).
6. **Modo foco da página:** abrir uma página de notas em tela limpa com o cronômetro, via contrato em `contracts`.
7. Persistir o cronômetro em andamento, para sobreviver ao fechamento do app.
