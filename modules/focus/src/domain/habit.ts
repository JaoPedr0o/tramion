import type { Day } from "./day.ts";

/** Todo dia, dias úteis (segunda a sexta) ou N vezes por semana. */
export type Frequency = "daily" | "weekdays" | "weekly";

export interface Habit {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly frequency: Frequency;
  /** Só na frequência semanal (1 a 7). */
  readonly timesPerWeek: number | null;
  /** Quando foi arquivado (ms); `null` = ativo. */
  readonly archivedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** O que a pessoa edita num hábito. */
export interface HabitInput {
  readonly name: string;
  readonly icon: string | null;
  readonly frequency: Frequency;
  readonly timesPerWeek: number | null;
}

/** Um dia marcado como feito. */
export interface HabitCheck {
  readonly habitId: string;
  readonly day: Day;
}

/** Uma sessão de foco concluída. */
export interface FocusSession {
  readonly id: string;
  readonly startedAt: number;
  readonly durationSec: number;
  /** Id (texto) da página de notas associada; o módulo não conhece o módulo de notas. */
  readonly noteId: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface PomodoroSettings {
  readonly focusMin: number;
  readonly breakMin: number;
  readonly longBreakMin: number;
  /** A cada quantas sessões vem a pausa longa; 0 = sem pausa longa. */
  readonly longBreakEvery: number;
  /** Avisa com notificação do sistema ao fim (desligado por padrão). */
  readonly notify: boolean;
  /** Toca o sino ao fim (app aberto) e usa o som no alarme do celular. Ligado por padrão. */
  readonly sound: boolean;
}

export const DEFAULT_SETTINGS: PomodoroSettings = {
  focusMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 0,
  notify: false,
  sound: true,
};
