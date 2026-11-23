# 0021. Lembretes de tarefas com hora e notificações agendadas no sistema

**Status:** Implementado no código e testado com a fake e com o plugin simulado. **Não verificado em aparelho real** (ver
"O que não foi possível verificar").

## Contexto

Os lembretes (ADR 0018) eram um resumo diário disparado por um relógio dentro do app, então só avisavam com o app aberto, e
a coluna de data guardava só o dia. A necessidade nova: marcar uma tarefa para um **horário**, e o celular avisar nesse
horário **mesmo com o app fechado**.

## Decisões

### 1. A data da célula aceita hora opcional

- Formato: `AAAA-MM-DD` (como antes) ou `AAAA-MM-DDTHH:MM`, **horário local** do aparelho, sem fuso e sem segundos.
- **O Rust valida** (`is_valid_date_value` em `modules/notes/rust/src/database.rs`): a data tem de existir no calendário; a
  hora, de 00:00 a 23:59, sempre com dois dígitos. A fake de teste (`test-support.ts`) espelha a regra.
- Dados atuais continuam válidos: só data é um valor válido. **Sem migração**: o valor já é texto JSON na célula.
- Sem fuso de propósito: "reunião às 14:30" é 14:30 onde a pessoa estiver. Quem viaja de fuso vê o aviso no relógio local do
  novo lugar. Os dois aparelhos sincronizam o texto, sem conversão.
- **Toda comparação por dia usa o prefixo de 10 caracteres** (`datePart`): varredura de tarefas (`scan_tasks`, `due_tasks`,
  `upcoming_tasks`), agenda, calendário (a linha cai no dia dela; arrastar para outro dia mantém a hora), filtros "antes/em/
  depois", gráfico por mês e `longDate`. A ordenação por texto continua certa (a data sem hora vem antes da mesma data com
  hora). O resumo diário e a agenda continuam contando por dia: uma tarefa de hoje às 18:00 aparece em "Hoje".
- Fica fora: exportação para Markdown mostra o valor como está (`2026-11-24 14:30` na tabela).

### 2. Quais notificações agendar (função pura)

`planScheduledNotifications` (`application/scheduled-reminders.ts`) recebe as tarefas, o "agora" e a antecedência e devolve a
lista a agendar:

- uma notificação por tarefa pendente **com hora** (concluídas já vêm filtradas pelo Rust); só data não agenda;
- horário do aviso = hora da tarefa − antecedência (0, 5, 10, 15, 30 ou 60 min; padrão 10);
- ignora o que já passou (o **aviso**: com 10 min de antecedência, uma tarefa que começa daqui a 5 min não agenda);
- **id estável** por tarefa: hash FNV-1a do id da página, 31 bits (o Android usa inteiro com sinal); colisão é resolvida
  andando para o próximo número livre no plano. Reagendar a mesma tarefa **substitui** a notificação (mesmo id);
- limite de **50** agendamentos (as mais próximas); o plano é refeito sempre que o app abre, edita ou sincroniza, então as
  seguintes entram na vez. Procura tarefas até 60 dias à frente (o limite da agenda).

### 3. Porta de plataforma

`NotesPlatform` ganhou `canScheduleNotifications`, `scheduleNotifications(items)` ("faça o agendado ser exatamente esta
lista": agenda o novo ou alterado e cancela o que sobrou) e `onNotificationOpened(handler)`. A implementação Tauri
(`infrastructure/tauri-notes-platform.ts`) carrega `@tauri-apps/plugin-notification` **sob demanda** e:

- **só age no celular.** No computador o plugin ignora o horário e mostraria tudo na hora, por isso lá é um não-fazer-nada;
- pede a permissão de notificações só quando há algo a agendar;
- cria o canal `tramion-lembretes` com importância alta (aparece na tela e toca);
- compara com `pending()` e só reagenda o que mudou, cancelando o resto;
- agenda com `plugin:notification|batch` (comando do plugin no Android, não exposto pelo pacote JS) em vez de
  `sendNotification`, porque **só o `batch` grava o aviso no armazenamento do plugin**; é esse armazenamento que o
  receptor de reinício (`LocalNotificationRestoreReceiver`) lê para reagendar depois de o aparelho reiniciar, e que
  `pending()` lista. Se o `batch` falhar por qualquer motivo, cai para `sendNotification` com `Schedule.at` (funciona,
  mas sem sobreviver a reinício até o app abrir de novo);
- usa `allowWhileIdle: true`, senão o plugin cai num alarme que **não acorda o aparelho** (`AlarmManager.RTC`).

### 4. Quando reagendar

`ReminderScheduler` (montado em `createMain`, sempre vivo; no computador não faz nada) refaz o plano: ao abrir o app, ao
voltar para ele, após qualquer edição de página (pausa de 1,5 s), após `notes.synced` (alterações vindas do outro
aparelho) e quando as preferências mudam. Rodadas simultâneas se juntam (`createReminderScheduler`). Se ler as tarefas
falhar, **não mexe** no que já está agendado.

### 5. Preferências

Na janela "Lembretes": ligar/desligar os avisos por hora e a antecedência (só no celular; no computador a janela explica que
esses avisos são do celular). Ficam no armazenamento do navegador do app, como as outras. O resumo diário continua igual.

### 6. Tocar na notificação

A tarefa vai em `extra.taskId`. Com o app em segundo plano ou aberto, `onAction` entrega o id e o app abre a página da
tarefa. **Limitação:** se o toque **abre o app do zero** (app fechado), o evento do plugin pode chegar antes de a interface
registrar o ouvinte e se perder; nesse caso o app só abre na tela inicial. O plugin não oferece um jeito de recuperar o
toque depois. Não foi verificado em aparelho.

### 7. Permissões Android

Acrescentadas ao `AndroidManifest.xml`: `USE_EXACT_ALARM` e `SCHEDULE_EXACT_ALARM` (`maxSdkVersion=32`). O plugin usa alarme
exato se `canScheduleExactAlarms()` for verdadeiro; sem as permissões, no Android 12+ cai em `setAndAllowWhileIdle`, que o
sistema pode atrasar vários minutos em modo de economia (Doze).

## Limites do Android

- **Alarmes exatos (Android 12+):** `SCHEDULE_EXACT_ALARM` vem **negada por padrão em instalações novas a partir do Android
  14**; o usuário teria de liberar em Configurações. `USE_EXACT_ALARM` (Android 13+) é concedida na instalação e não pode
  ser revogada, **mas a Google Play só a permite a apps de alarme/relógio/calendário**. O Tramion é distribuído por APK, onde
  isso não se aplica; se um dia for à loja, é preciso conferir a política ou voltar ao alarme inexato. No Android 17 (o do
  aparelho do usuário) as regras para alarmes exatos e para apps em segundo plano podem ser mais rígidas: **não consegui
  consultar a documentação dessa versão**, então não afirmo nada sobre ela.
- **Economia de bateria (Samsung e outros):** a Samsung (One UI) coloca apps "sem uso" para dormir e pode cancelar os alarmes
  de apps "adormecidos" ou com bateria "otimizada". Para os avisos tocarem, o Tramion deve ficar em **Bateria > Sem
  restrições** (e fora de "Apps em suspensão"/"Apps em suspensão profunda"). Não há como o app garantir isso sozinho.
- **Reinício do aparelho:** os alarmes do sistema somem ao reiniciar. O plugin tem um receptor de `BOOT_COMPLETED` que
  reagenda os avisos guardados (por isso o uso do `batch`); alguns fabricantes bloqueiam o início automático de apps, e então
  os avisos só voltam quando o app for aberto de novo.
- **Forçar parada:** "Forçar parada" nas configurações do app cancela os alarmes até a próxima abertura.
- **Silêncio e "Não perturbe"** continuam valendo; a permissão de notificações (Android 13+) precisa estar concedida.
- **Quantidade:** limitamos a 50 avisos; o Android aceita muito mais, mas um plano curto é mais barato de refazer.
- **Precisão:** mesmo com alarme exato, o aviso pode chegar com poucos segundos de diferença.

## O que não foi possível verificar

Tudo isto foi feito sem aparelho (a pessoa que pediu testa no celular). Testado: Rust (validação, varredura por dia),
funções puras, agendador, plataforma Tauri com o plugin simulado, interface com a fake. **Não verificado:**

1. Que o comando `plugin:notification|batch` chamado do JavaScript funciona no Android com o formato usado (`schedule.at.date`
   em ISO) e que grava o aviso para o reinício. Há queda para `sendNotification` se o `batch` falhar.
2. Que o aviso toca no horário, com a tela apagada, em Doze, com e sem alarme exato (inclusive no Android 17).
3. Os efeitos da economia de bateria da Samsung e do reinício do aparelho.
4. Que tocar na notificação abre a página da tarefa, principalmente com o app totalmente fechado (provável limitação).
5. O aspecto dos novos botões e do seletor de hora no aparelho (o seletor de hora é o nativo do navegador do sistema).
6. A compilação do APK com as novas permissões foi tentada apenas como checagem de compilação (ver o relatório da entrega).
