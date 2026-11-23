import type { Day } from "../domain/day.ts";
import type {
  FocusSession,
  Habit,
  HabitCheck,
  HabitInput,
  PomodoroSettings,
} from "../domain/habit.ts";

/**
 * Tudo que o módulo Foco precisa para ler e gravar dados. A interface só conhece este contrato, então
 * os testes usam uma versão em memória e o app usa a do Tauri (que chama o Rust).
 */
export interface FocusGateway {
  listHabits(includeArchived: boolean): Promise<Habit[]>;
  createHabit(input: HabitInput): Promise<Habit>;
  updateHabit(id: string, input: HabitInput): Promise<Habit>;
  archiveHabit(id: string, archived: boolean): Promise<Habit>;
  /** As marcações de todos os hábitos entre dois dias (inclusive). */
  listChecks(from: Day, to: Day): Promise<HabitCheck[]>;
  setCheck(args: { habitId: string; day: Day; done: boolean }): Promise<void>;
  recordSession(args: {
    startedAt: number;
    durationSec: number;
    noteId: string | null;
  }): Promise<FocusSession>;
  /** As sessões mais recentes primeiro, a partir de `since` (ms), se informado. */
  listSessions(args: { since?: number; limit?: number }): Promise<FocusSession[]>;
  getSettings(): Promise<PomodoroSettings>;
  saveSettings(settings: PomodoroSettings): Promise<PomodoroSettings>;
}

/** O que o módulo pede ao SISTEMA (não aos dados). É a "porta" da plataforma: injetada, nunca importada do módulo de notas. */
export interface FocusPlatform {
  /** Mostra uma notificação do sistema (pede a permissão na primeira vez; sem permissão, não faz nada). */
  notify(title: string, body: string): Promise<void>;
}

/** O relógio: injetável para os testes controlarem a hora e o fuso. */
export interface Clock {
  now(): number;
  /** Nome IANA do fuso; sem ele, o do aparelho. */
  readonly timeZone?: string;
}

export const systemClock: Clock = { now: () => Date.now() };
