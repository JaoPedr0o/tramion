import { dayOf } from "../domain/day.ts";
import { DEFAULT_SETTINGS, type FocusSession, type PomodoroSettings } from "../domain/habit.ts";
import { NO_NOTIFICATIONS, planNotifications } from "../domain/notification-plan.ts";
import {
  IDLE,
  durationMsFor,
  endMessage,
  isFinished,
  nextKind,
  pauseTimer,
  resumeTimer,
  startTimer,
  type Timer,
  type TimerKind,
} from "../domain/pomodoro.ts";
import { FocusError } from "../domain/errors.ts";
import type { Clock, FocusAlarm, FocusGateway, FocusPlatform } from "./focus-gateway.ts";

/** Uma sessão que terminou e ainda espera a pessoa decidir o que fazer (ou o registro ser salvo). */
export interface Finished {
  readonly kind: TimerKind;
  /** A sessão de foco não pôde ser gravada (o motivo está em `recordFailed`); dá para tentar de novo. */
  readonly recordFailed: boolean;
}

export interface PomodoroSnapshot {
  readonly timer: Timer;
  readonly settings: PomodoroSettings;
  /** Sessões de foco concluídas no ciclo atual (para a pausa longa). Zera depois da pausa longa. */
  readonly completedInCycle: number;
  readonly finished: Finished | null;
  /** Sessões de foco recentes (para o resumo de hoje). */
  readonly sessions: readonly FocusSession[];
  readonly loaded: boolean;
  /** Falha ao ler ou gravar ajustes. */
  readonly error: FocusError | null;
}

/** O maior atraso que o `setTimeout` aceita (acima disso ele dispara na hora). */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
/** O resumo de hoje olha as últimas 36 horas e filtra pelo dia local (cobre qualquer fuso). */
const RECENT_MS = 36 * 3_600_000;
/**
 * Um fim que a tela só percebe passado mais que isso (app fechado, janela oculta) é "atrasado": a sessão é registrada,
 * mas o sino e o aviso não tocam de novo, porque o momento já passou (e o alarme do sistema, se houve, já avisou).
 */
const LATE_MS = 10_000;

export interface PomodoroStoreOptions {
  readonly gateway: FocusGateway;
  readonly platform: FocusPlatform;
  readonly alarm: FocusAlarm;
  readonly clock: Clock;
}

/** Roda os trabalhos um depois do outro (a ordem das gravações e dos avisos do sistema importa). */
function createQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

/**
 * O estado do pomodoro vive AQUI, fora da tela: trocar de tela (ou desmontar a interface) não o perde nem o
 * pausa. O fim é agendado por `setTimeout` até a hora de término, e quem estiver olhando (a interface) também
 * chama `tick()` periodicamente e quando a janela volta ao foco, porque navegadores atrasam temporizadores de
 * janelas ocultas. Em qualquer caso o tempo é decidido pelo relógio, nunca por contagem.
 *
 * O cronômetro também é GUARDADO no banco (hora de término ou restante) a cada mudança, e `init()` o retoma: se ainda
 * roda, a tela continua do ponto certo; se terminou com o app fechado, a sessão é registrada como concluída (com o
 * início real) sem inventar tempo. No celular, o sistema ainda recebe um alarme agendado para a hora de término, que
 * avisa mesmo com o app fechado (ver `FocusPlatform`).
 */
export function createPomodoroStore({ gateway, platform, alarm, clock }: PomodoroStoreOptions) {
  let state: PomodoroSnapshot = {
    timer: IDLE,
    settings: DEFAULT_SETTINGS,
    completedInCycle: 0,
    finished: null,
    sessions: [],
    loaded: false,
    error: null,
  };
  let handle: ReturnType<typeof setTimeout> | null = null;
  let initStarted = false;
  /** A sessão de foco que terminou e ainda não foi gravada (para "Tentar de novo"). */
  /** Alguma gravação do cronômetro falhou: antes de concluir, o banco precisa receber o cronômetro de novo. */
  let storageDirty = false;
  let unrecorded: { timer: Extract<Timer, { phase: "running" }>; cycleBefore: number } | null =
    null;
  const listeners = new Set<() => void>();
  const persistQueue = createQueue();
  const systemQueue = createQueue();

  const set = (patch: Partial<PomodoroSnapshot>) => {
    state = { ...state, ...patch };
    reschedule();
    for (const listener of [...listeners]) listener();
  };

  function reschedule() {
    if (handle !== null) clearTimeout(handle);
    handle = null;
    if (state.timer.phase !== "running") return;
    const wait = Math.min(MAX_TIMEOUT_MS, Math.max(0, state.timer.endsAt - clock.now()));
    handle = setTimeout(() => {
      handle = null;
      tick();
      // Disparou um pouco antes da hora (ou o atraso foi limitado): agenda de novo em vez de ficar parado.
      if (state.timer.phase === "running") reschedule();
    }, wait);
  }

  /** Põe o sistema (notificação fixa e alarme do fim) como o cronômetro de agora pede. Falhas não atrapalham. */
  function syncSystem() {
    const plan = planNotifications(state.timer, state.settings, clock.now(), clock.timeZone);
    void systemQueue(() => platform.syncTimerNotifications(plan)).catch(() => {});
  }

  /** Guarda o cronômetro atual (e o ciclo) no banco, em ordem. Falhas não atrapalham o cronômetro em memória. */
  function persist() {
    const record = { timer: state.timer, cycle: state.completedInCycle };
    void persistQueue(() => gateway.saveTimer(record)).then(
      () => {
        storageDirty = false;
      },
      () => {
        storageDirty = true;
      },
    );
  }

  async function refreshSessions() {
    try {
      const sessions = await gateway.listSessions({ since: clock.now() - RECENT_MS, limit: 200 });
      set({ sessions });
    } catch {
      // O resumo de hoje é só um enfeite: sem ele, o cronômetro segue funcionando.
    }
  }

  /** Conclui no banco: registra a sessão e para o cronômetro de uma vez só (regrava antes se uma gravação falhou). */
  async function finishRecord(timer: Extract<Timer, { phase: "running" }>, cycleBefore: number) {
    const cycleAfter = state.completedInCycle;
    try {
      await persistQueue(async () => {
        if (storageDirty) await gateway.saveTimer({ timer, cycle: cycleBefore });
        await gateway.finishTimer(cycleAfter);
        storageDirty = false;
      });
      return true;
    } catch {
      return false;
    }
  }

  async function complete(timer: Extract<Timer, { phase: "running" }>, late: boolean) {
    const isFocus = timer.kind === "focus";
    const cycleBefore = state.completedInCycle;
    const cycle = isFocus ? cycleBefore + 1 : timer.kind === "long-break" ? 0 : cycleBefore;
    // Primeiro o cronômetro muda de fase (para ninguém ver "00:00 rodando"), depois grava e avisa.
    set({
      timer: IDLE,
      completedInCycle: cycle,
      finished: { kind: timer.kind, recordFailed: false },
    });
    void systemQueue(() => platform.clearOngoing()).catch(() => {});

    // No celular o alarme agendado já avisa (som, vibração e notificação, até com o app aberto): tocar aqui também
    // dobraria o aviso. No computador, o sino toca (se ligado) e a notificação só sai se a pessoa ligou.
    if (!late && !platform.systemAlarm) {
      if (state.settings.sound) alarm.ring();
      if (state.settings.notify) {
        void platform.notify("Tramion · Foco", endMessage(timer.kind)).catch(() => {});
      }
    }

    const saved = await finishRecord(timer, cycleBefore);
    if (!saved && isFocus) {
      unrecorded = { timer, cycleBefore };
      set({ finished: { kind: timer.kind, recordFailed: true } });
    } else if (isFocus) await refreshSessions();
  }

  /** Confere o relógio e conclui o que já terminou. Seguro de chamar à vontade (idempotente). */
  function tick() {
    const timer = state.timer;
    if (timer.phase === "running" && isFinished(timer, clock.now())) {
      void complete(timer, clock.now() - timer.endsAt > LATE_MS);
    }
  }

  function start(kind: TimerKind = "focus", noteId: string | null = null) {
    if (state.timer.phase !== "idle") return;
    // Este clique é o gesto que libera o áudio para o sino do fim.
    alarm.unlock();
    set({
      timer: startTimer(kind, clock.now(), durationMsFor(kind, state.settings), noteId),
      finished: null,
    });
    persist();
    syncSystem();
  }

  /** Retoma o cronômetro guardado ao abrir o app. */
  async function restore() {
    let record;
    try {
      record = await gateway.getTimer();
    } catch {
      return;
    }
    // A pessoa já iniciou outro cronômetro enquanto o banco respondia: o dela vale.
    if (state.timer.phase !== "idle") return;
    set({ completedInCycle: record.cycle });
    const timer = record.timer;
    if (timer.phase === "running" && isFinished(timer, clock.now())) {
      // Terminou com o app fechado: registra a sessão com o início real e mostra o estado final, sem sino.
      await complete(timer, clock.now() - timer.endsAt > LATE_MS);
      return;
    }
    if (timer.phase !== "idle") set({ timer });
    // Também limpa o que sobrou no sistema (por exemplo, uma notificação fixa de um cronômetro já encerrado).
    syncSystem();
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: (): PomodoroSnapshot => state,
    now: () => clock.now(),
    /** O sistema avisa o fim sozinho (celular): a tela não precisa mostrar opção de notificação do computador. */
    systemAlarm: platform.systemAlarm,

    /** Carrega ajustes, retoma o cronômetro guardado e lê as sessões recentes (uma vez). Não mostra nada por conta própria. */
    async init() {
      if (initStarted) return;
      initStarted = true;
      try {
        const settings = await gateway.getSettings();
        set({ settings, loaded: true });
      } catch (error) {
        set({
          loaded: true,
          error:
            error instanceof FocusError ? error : new FocusError("focus.internal", String(error)),
        });
      }
      await restore();
      await refreshSessions();
    },

    start,

    pause() {
      if (state.timer.phase !== "running") return;
      set({ timer: pauseTimer(state.timer, clock.now()) });
      persist();
      syncSystem();
    },

    resume() {
      if (state.timer.phase !== "paused") return;
      set({ timer: resumeTimer(state.timer, clock.now()) });
      persist();
      syncSystem();
    },

    /** Cancela (ou pula a pausa). Uma sessão de foco cancelada NÃO é registrada. */
    cancel() {
      if (state.timer.phase === "idle") return;
      set({ timer: IDLE });
      persist();
      // Cancelar tira tudo: a notificação fixa e o alarme agendado.
      void systemQueue(() => platform.syncTimerNotifications(NO_NOTIFICATIONS)).catch(() => {});
    },

    /** Fecha o aviso de "sessão concluída" sem iniciar nada. */
    dismissFinished() {
      set({ finished: null });
    },

    /** Começa o que vem depois do que acabou de terminar (pausa ou foco). */
    startNext(noteId: string | null = null) {
      const finished = state.finished;
      if (state.timer.phase !== "idle") return;
      const kind = finished
        ? nextKind(finished.kind, state.completedInCycle, state.settings)
        : "focus";
      start(kind, kind === "focus" ? noteId : null);
    },

    /** Tenta de novo gravar a sessão que não foi salva (o cronômetro continua guardado como "rodando"). */
    async retryRecord() {
      const finished = state.finished;
      const pending = unrecorded;
      if (!finished?.recordFailed || !pending) return;
      if (!(await finishRecord(pending.timer, pending.cycleBefore))) return;
      unrecorded = null;
      // A pessoa pode ter dispensado o aviso ou começado outra coisa enquanto o banco respondia.
      if (state.finished === finished)
        set({ finished: { kind: finished.kind, recordFailed: false } });
      await refreshSessions();
    },

    async saveSettings(next: PomodoroSettings): Promise<boolean> {
      try {
        const saved = await gateway.saveSettings(next);
        set({ settings: saved, error: null });
        // O som mudou: o alarme agendado troca de canal (com ou sem som).
        syncSystem();
        return true;
      } catch (error) {
        set({
          error:
            error instanceof FocusError ? error : new FocusError("focus.internal", String(error)),
        });
        return false;
      }
    },

    /** Refaz as notificações do sistema para o cronômetro de agora (ao voltar para o app). */
    resyncSystem() {
      if (state.timer.phase !== "idle") syncSystem();
    },

    /** Toca o sino de teste (botão "Ouvir" nos ajustes; também libera o áudio). */
    previewAlarm() {
      alarm.unlock();
      alarm.ring();
    },

    /** Confere o relógio (a interface chama de tempos em tempos e ao voltar para a janela). */
    tick,

    /** Para o agendamento (testes e encerramento). */
    dispose() {
      if (handle !== null) clearTimeout(handle);
      handle = null;
      listeners.clear();
    },

    /** O dia local de hoje, pelo relógio e fuso do módulo. */
    today: () => dayOf(clock.now(), clock.timeZone),
    /** O dia local de um instante qualquer (mesmo fuso). */
    dayOf: (ms: number) => dayOf(ms, clock.timeZone),
  };
}

export type PomodoroStore = ReturnType<typeof createPomodoroStore>;
