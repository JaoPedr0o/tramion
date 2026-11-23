import { invoke } from "@tauri-apps/api/core";
import type { FocusGateway } from "../application/focus-gateway.ts";
import type { FocusSession, Habit, HabitCheck, PomodoroSettings } from "../domain/habit.ts";
import type { Timer, TimerKind, TimerRecord } from "../domain/pomodoro.ts";
import { toFocusError } from "./focus-error.ts";

/** O cronômetro como o Rust o guarda (campos que não valem na fase atual vêm `null`). */
interface TimerWire {
  phase: "idle" | "running" | "paused";
  kind: TimerKind | null;
  startedAt: number | null;
  durationMs: number | null;
  endsAt: number | null;
  remainingMs: number | null;
  noteId: string | null;
  cycle: number;
}

export function timerToWire({ timer, cycle }: TimerRecord): TimerWire {
  if (timer.phase === "idle") {
    return {
      phase: "idle",
      kind: null,
      startedAt: null,
      durationMs: null,
      endsAt: null,
      remainingMs: null,
      noteId: null,
      cycle,
    };
  }
  return {
    phase: timer.phase,
    kind: timer.kind,
    startedAt: timer.startedAt,
    durationMs: timer.durationMs,
    endsAt: timer.phase === "running" ? timer.endsAt : null,
    remainingMs: timer.phase === "paused" ? timer.remainingMs : null,
    noteId: timer.noteId,
    cycle,
  };
}

/** Lê o que o Rust guardou; qualquer coisa incoerente vira "parado" (nunca inventa um cronômetro). */
export function timerFromWire(wire: TimerWire): TimerRecord {
  const { kind, startedAt, durationMs } = wire;
  let timer: Timer = { phase: "idle" };
  if (kind !== null && startedAt !== null && durationMs !== null) {
    if (wire.phase === "running" && wire.endsAt !== null) {
      timer = {
        phase: "running",
        kind,
        startedAt,
        durationMs,
        endsAt: wire.endsAt,
        noteId: wire.noteId,
      };
    } else if (wire.phase === "paused" && wire.remainingMs !== null) {
      timer = {
        phase: "paused",
        kind,
        startedAt,
        durationMs,
        remainingMs: wire.remainingMs,
        noteId: wire.noteId,
      };
    }
  }
  return { timer, cycle: wire.cycle };
}

/** Chama um comando do plugin Rust (`plugin:focus|<comando>`) e padroniza o erro. */
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(`plugin:focus|${command}`, args);
  } catch (error) {
    throw toFocusError(error);
  }
}

/** Cumpre o contrato chamando o Rust. O Tauri converte `camelCase` (aqui) em `snake_case` (no Rust). */
export function createTauriFocusGateway(): FocusGateway {
  return {
    listHabits: (includeArchived) => call<Habit[]>("habit_list", { includeArchived }),
    createHabit: (input) => call<Habit>("habit_create", { input }),
    updateHabit: (id, input) => call<Habit>("habit_update", { id, input }),
    archiveHabit: (id, archived) => call<Habit>("habit_archive", { id, archived }),
    listChecks: (from, to) => call<HabitCheck[]>("habit_checks", { from, to }),
    setCheck: ({ habitId, day, done }) => call<void>("habit_set_check", { habitId, day, done }),
    getTimer: async () => timerFromWire(await call<TimerWire>("timer_get")),
    saveTimer: async (record) => {
      await call<TimerWire>("timer_set", { state: timerToWire(record) });
    },
    finishTimer: async (cycle) =>
      (await call<{ session: FocusSession | null }>("timer_finish", { cycle })).session,
    listSessions: ({ since, limit }) =>
      call<FocusSession[]>("session_list", { since: since ?? null, limit: limit ?? null }),
    getSettings: () => call<PomodoroSettings>("settings_get"),
    saveSettings: (settings) => call<PomodoroSettings>("settings_set", { settings }),
  };
}
