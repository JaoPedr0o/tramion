// Auxiliares SÓ para testes (não fazem parte da API pública do módulo).
import { vi, type Mock } from "vitest";
import type {
  Clock,
  FocusAlarm,
  FocusGateway,
  FocusPlatform,
} from "./application/focus-gateway.ts";
import type { Day } from "./domain/day.ts";
import { FocusError } from "./domain/errors.ts";
import { IDLE, type TimerRecord } from "./domain/pomodoro.ts";
import {
  DEFAULT_SETTINGS,
  type FocusSession,
  type Habit,
  type HabitCheck,
  type HabitInput,
  type PomodoroSettings,
} from "./domain/habit.ts";

/** Relógio controlável. `advance` anda o tempo; o fuso é fixo (padrão UTC, para o teste não depender da máquina). */
export function fakeClock(start: number, timeZone = "UTC") {
  let current = start;
  const clock: Clock & { advance(ms: number): void; set(ms: number): void } = {
    now: () => current,
    timeZone,
    advance(ms) {
      current += ms;
    },
    set(ms) {
      current = ms;
    },
  };
  return clock;
}

export function platformStub(options: { systemAlarm?: boolean } = {}): FocusPlatform & {
  notify: ReturnType<typeof vi.fn>;
  syncTimerNotifications: ReturnType<typeof vi.fn>;
  clearOngoing: ReturnType<typeof vi.fn>;
} {
  return {
    systemAlarm: options.systemAlarm ?? false,
    notify: vi.fn(async () => {}),
    syncTimerNotifications: vi.fn(async () => {}),
    clearOngoing: vi.fn(async () => {}),
  };
}

export function alarmStub(): FocusAlarm & { unlock: Mock<() => void>; ring: Mock<() => void> } {
  return { unlock: vi.fn<() => void>(), ring: vi.fn<() => void>() };
}

/** Gateway em memória que se comporta como o Rust (validações principais incluídas). */
export function memoryGateway(
  options: { now?: () => number; failWith?: () => FocusError | null } = {},
): FocusGateway & {
  habits: Habit[];
  checks: HabitCheck[];
  sessions: FocusSession[];
  settings: PomodoroSettings;
  timer: TimerRecord;
} {
  const now = options.now ?? (() => Date.now());
  let seq = 0;
  const id = () => `id${++seq}`;
  const state = {
    habits: [] as Habit[],
    checks: [] as HabitCheck[],
    sessions: [] as FocusSession[],
    settings: DEFAULT_SETTINGS,
    timer: { timer: IDLE, cycle: 0 } as TimerRecord,
  };
  const guard = () => {
    const error = options.failWith?.();
    if (error) throw error;
  };
  const find = (habitId: string) => {
    const habit = state.habits.find((h) => h.id === habitId);
    if (!habit) throw new FocusError("focus.not-found", "hábito não encontrado");
    return habit;
  };
  const clean = (input: HabitInput) => {
    const name = input.name.trim();
    if (name === "" || name.length > 100) throw new FocusError("focus.name-invalid", "nome");
    if (
      input.frequency === "weekly" &&
      !(input.timesPerWeek && input.timesPerWeek >= 1 && input.timesPerWeek <= 7)
    )
      throw new FocusError("focus.frequency-invalid", "frequência");
    return {
      name,
      icon: input.icon?.trim() || null,
      frequency: input.frequency,
      timesPerWeek: input.frequency === "weekly" ? input.timesPerWeek : null,
    };
  };

  return {
    get habits() {
      return state.habits;
    },
    get checks() {
      return state.checks;
    },
    get sessions() {
      return state.sessions;
    },
    get settings() {
      return state.settings;
    },
    get timer() {
      return state.timer;
    },
    async listHabits(includeArchived) {
      guard();
      return state.habits.filter((h) => includeArchived || h.archivedAt === null);
    },
    async createHabit(input) {
      guard();
      const habit: Habit = {
        id: id(),
        ...clean(input),
        archivedAt: null,
        createdAt: now(),
        updatedAt: now(),
      };
      state.habits.push(habit);
      return habit;
    },
    async updateHabit(habitId, input) {
      guard();
      const habit = { ...find(habitId), ...clean(input), updatedAt: now() };
      state.habits = state.habits.map((h) => (h.id === habitId ? habit : h));
      return habit;
    },
    async archiveHabit(habitId, archived) {
      guard();
      const habit = { ...find(habitId), archivedAt: archived ? now() : null, updatedAt: now() };
      state.habits = state.habits.map((h) => (h.id === habitId ? habit : h));
      return habit;
    },
    async listChecks(from: Day, to: Day) {
      guard();
      return state.checks.filter((c) => c.day >= from && c.day <= to);
    },
    async setCheck({ habitId, day, done }) {
      guard();
      if (find(habitId).archivedAt !== null) throw new FocusError("focus.archived", "arquivado");
      state.checks = state.checks.filter((c) => !(c.habitId === habitId && c.day === day));
      if (done) state.checks.push({ habitId, day });
    },
    async getTimer() {
      guard();
      return state.timer;
    },
    async saveTimer(record) {
      guard();
      state.timer = record;
    },
    // Como o Rust: só conclui o que está RODANDO; foco vira sessão; fica parado com o ciclo informado.
    async finishTimer(cycle) {
      guard();
      const { timer } = state.timer;
      if (timer.phase !== "running") return null;
      state.timer = { timer: IDLE, cycle };
      if (timer.kind !== "focus") return null;
      const session: FocusSession = {
        id: id(),
        startedAt: timer.startedAt,
        durationSec: Math.round(timer.durationMs / 1000),
        noteId: timer.noteId,
        createdAt: now(),
        updatedAt: now(),
      };
      state.sessions.push(session);
      return session;
    },
    async listSessions({ since = 0, limit = 200 }) {
      guard();
      return state.sessions
        .filter((s) => s.startedAt >= since)
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, limit);
    },
    async getSettings() {
      guard();
      return state.settings;
    },
    async saveSettings(settings) {
      guard();
      state.settings = settings;
      return settings;
    },
  };
}
