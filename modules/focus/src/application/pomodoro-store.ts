import { dayOf } from "../domain/day.ts";
import { DEFAULT_SETTINGS, type FocusSession, type PomodoroSettings } from "../domain/habit.ts";
import {
  IDLE,
  durationMsFor,
  isFinished,
  kindLabel,
  nextKind,
  pauseTimer,
  resumeTimer,
  startTimer,
  type Timer,
  type TimerKind,
} from "../domain/pomodoro.ts";
import { FocusError } from "../domain/errors.ts";
import type { Clock, FocusGateway, FocusPlatform } from "./focus-gateway.ts";

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

export interface PomodoroStoreOptions {
  readonly gateway: FocusGateway;
  readonly platform: FocusPlatform;
  readonly clock: Clock;
}

/**
 * O estado do pomodoro vive AQUI, fora da tela: trocar de tela (ou desmontar a interface) não o perde nem o
 * pausa. O fim é agendado por `setTimeout` até a hora de término, e quem estiver olhando (a interface) também
 * chama `tick()` periodicamente e quando a janela volta ao foco, porque navegadores atrasam temporizadores de
 * janelas ocultas. Em qualquer caso o tempo é decidido pelo relógio, nunca por contagem.
 */
export function createPomodoroStore({ gateway, platform, clock }: PomodoroStoreOptions) {
  let state: PomodoroSnapshot = {
    timer: IDLE,
    settings: DEFAULT_SETTINGS,
    completedInCycle: 0,
    finished: null,
    sessions: [],
    loaded: false,
    error: null,
  };
  let pending: { startedAt: number; durationSec: number; noteId: string | null } | null = null;
  let handle: ReturnType<typeof setTimeout> | null = null;
  let initStarted = false;
  const listeners = new Set<() => void>();

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

  async function refreshSessions() {
    try {
      const sessions = await gateway.listSessions({ since: clock.now() - RECENT_MS, limit: 200 });
      set({ sessions });
    } catch {
      // O resumo de hoje é só um enfeite: sem ele, o cronômetro segue funcionando.
    }
  }

  async function saveRecord(): Promise<boolean> {
    if (!pending) return true;
    try {
      await gateway.recordSession(pending);
      pending = null;
      return true;
    } catch {
      return false;
    }
  }

  async function complete(timer: Extract<Timer, { phase: "running" }>) {
    const isFocus = timer.kind === "focus";
    const cycle = isFocus
      ? state.completedInCycle + 1
      : timer.kind === "long-break"
        ? 0
        : state.completedInCycle;
    if (isFocus) {
      pending = {
        startedAt: timer.startedAt,
        durationSec: Math.round(timer.durationMs / 1000),
        noteId: timer.noteId,
      };
    }
    // Primeiro o cronômetro muda de fase (para ninguém ver "00:00 rodando"), depois grava e avisa.
    set({ timer: IDLE, completedInCycle: cycle, finished: { kind: timer.kind, recordFailed: false } });

    if (state.settings.notify) {
      const message = isFocus
        ? "Sessão de foco concluída. Hora de uma pausa."
        : `${kindLabel(timer.kind)} terminou. Pronto para focar?`;
      void platform.notify("Tramion · Foco", message).catch(() => {});
    }
    if (isFocus) {
      const saved = await saveRecord();
      if (!saved) set({ finished: { kind: timer.kind, recordFailed: true } });
      else await refreshSessions();
    }
  }

  /** Confere o relógio e conclui o que já terminou. Seguro de chamar à vontade (idempotente). */
  function tick() {
    const timer = state.timer;
    if (timer.phase === "running" && isFinished(timer, clock.now())) void complete(timer);
  }

  function start(kind: TimerKind = "focus", noteId: string | null = null) {
    if (state.timer.phase !== "idle") return;
    set({
      timer: startTimer(kind, clock.now(), durationMsFor(kind, state.settings), noteId),
      finished: null,
    });
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: (): PomodoroSnapshot => state,
    now: () => clock.now(),

    /** Carrega ajustes e sessões recentes (uma vez). Nunca mostra nada ao usuário por conta própria. */
    async init() {
      if (initStarted) return;
      initStarted = true;
      try {
        const settings = await gateway.getSettings();
        set({ settings, loaded: true });
      } catch (error) {
        set({
          loaded: true,
          error: error instanceof FocusError ? error : new FocusError("focus.internal", String(error)),
        });
      }
      await refreshSessions();
    },

    start,

    pause() {
      set({ timer: pauseTimer(state.timer, clock.now()) });
    },

    resume() {
      set({ timer: resumeTimer(state.timer, clock.now()) });
    },

    /** Cancela (ou pula a pausa). Uma sessão de foco cancelada NÃO é registrada. */
    cancel() {
      if (state.timer.phase === "idle") return;
      set({ timer: IDLE });
    },

    /** Fecha o aviso de "sessão concluída" sem iniciar nada. */
    dismissFinished() {
      set({ finished: null });
    },

    /** Começa o que vem depois do que acabou de terminar (pausa ou foco). */
    startNext(noteId: string | null = null) {
      const finished = state.finished;
      if (state.timer.phase !== "idle") return;
      const kind = finished ? nextKind(finished.kind, state.completedInCycle, state.settings) : "focus";
      start(kind, kind === "focus" ? noteId : null);
    },

    async retryRecord() {
      if (!state.finished?.recordFailed) return;
      if (await saveRecord()) {
        set({ finished: { kind: state.finished.kind, recordFailed: false } });
        await refreshSessions();
      }
    },

    async saveSettings(next: PomodoroSettings): Promise<boolean> {
      try {
        const saved = await gateway.saveSettings(next);
        set({ settings: saved, error: null });
        return true;
      } catch (error) {
        set({
          error: error instanceof FocusError ? error : new FocusError("focus.internal", String(error)),
        });
        return false;
      }
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
  };
}

export type PomodoroStore = ReturnType<typeof createPomodoroStore>;
