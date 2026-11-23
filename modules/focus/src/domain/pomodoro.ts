import type { PomodoroSettings } from "./habit.ts";

/** O que o cronômetro está contando: foco, pausa curta ou pausa longa. */
export type TimerKind = "focus" | "break" | "long-break";

/**
 * O cronômetro como DADO (sem relógio dentro). O tempo restante nunca vem de uma contagem de ticks: vem da
 * HORA DE TÉRMINO (`endsAt`), então atrasos do navegador, tela bloqueada ou troca de tela não o desviam.
 */
export type Timer =
  | { readonly phase: "idle" }
  | {
      readonly phase: "running";
      readonly kind: TimerKind;
      /** Quando a sessão começou de verdade (ms). */
      readonly startedAt: number;
      readonly durationMs: number;
      /** Hora de término (ms desde 1970). */
      readonly endsAt: number;
      readonly noteId: string | null;
    }
  | {
      readonly phase: "paused";
      readonly kind: TimerKind;
      readonly startedAt: number;
      readonly durationMs: number;
      readonly remainingMs: number;
      readonly noteId: string | null;
    };

export const IDLE: Timer = { phase: "idle" };

export function startTimer(
  kind: TimerKind,
  now: number,
  durationMs: number,
  noteId: string | null = null,
): Timer {
  return { phase: "running", kind, startedAt: now, durationMs, endsAt: now + durationMs, noteId };
}

/** Tempo que falta. Se o relógio do sistema voltar para trás, nunca passa da duração total. */
export function remainingMs(timer: Timer, now: number): number {
  if (timer.phase === "idle") return 0;
  if (timer.phase === "paused") return timer.remainingMs;
  return Math.min(timer.durationMs, Math.max(0, timer.endsAt - now));
}

export function pauseTimer(timer: Timer, now: number): Timer {
  if (timer.phase !== "running") return timer;
  return {
    phase: "paused",
    kind: timer.kind,
    startedAt: timer.startedAt,
    durationMs: timer.durationMs,
    remainingMs: remainingMs(timer, now),
    noteId: timer.noteId,
  };
}

export function resumeTimer(timer: Timer, now: number): Timer {
  if (timer.phase !== "paused") return timer;
  return {
    phase: "running",
    kind: timer.kind,
    startedAt: timer.startedAt,
    durationMs: timer.durationMs,
    endsAt: now + timer.remainingMs,
    noteId: timer.noteId,
  };
}

/** O tempo acabou (só vale para cronômetro rodando; pausado nunca termina sozinho). */
export function isFinished(timer: Timer, now: number): boolean {
  return timer.phase === "running" && now >= timer.endsAt;
}

export function durationMsFor(kind: TimerKind, settings: PomodoroSettings): number {
  const minutes =
    kind === "focus"
      ? settings.focusMin
      : kind === "break"
        ? settings.breakMin
        : settings.longBreakMin;
  return minutes * 60_000;
}

/**
 * O que vem depois. Depois do foco: pausa (longa a cada N sessões, se ligada); depois de qualquer pausa: foco.
 * `completedFocus` já conta o foco que acabou de terminar.
 */
export function nextKind(
  finished: TimerKind,
  completedFocus: number,
  settings: PomodoroSettings,
): TimerKind {
  if (finished !== "focus") return "focus";
  const every = settings.longBreakEvery;
  return every >= 2 && completedFocus > 0 && completedFocus % every === 0 ? "long-break" : "break";
}

/** "MM:SS" (ou "H:MM:SS"). Arredonda para cima: mostra 00:01 até o último instante, e 00:00 só no fim. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}

/** "1 h 15 min", "25 min", "0 min". */
export function formatMinutes(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function kindLabel(kind: TimerKind): string {
  return kind === "focus" ? "Foco" : kind === "break" ? "Pausa" : "Pausa longa";
}
