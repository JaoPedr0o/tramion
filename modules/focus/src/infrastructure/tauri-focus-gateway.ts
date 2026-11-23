import { invoke } from "@tauri-apps/api/core";
import type { FocusGateway } from "../application/focus-gateway.ts";
import type { FocusSession, Habit, HabitCheck, PomodoroSettings } from "../domain/habit.ts";
import { toFocusError } from "./focus-error.ts";

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
    recordSession: ({ startedAt, durationSec, noteId }) =>
      call<FocusSession>("session_record", { startedAt, durationSec, noteId }),
    listSessions: ({ since, limit }) =>
      call<FocusSession[]>("session_list", { since: since ?? null, limit: limit ?? null }),
    getSettings: () => call<PomodoroSettings>("settings_get"),
    saveSettings: (settings) => call<PomodoroSettings>("settings_set", { settings }),
  };
}
