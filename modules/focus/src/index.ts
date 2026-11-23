// API pública do módulo Foco. Tudo que não é exportado aqui é privado.
export { createFocusModule } from "./module.ts";
export type { FocusGateway, FocusPlatform, Clock } from "./application/focus-gateway.ts";
export { FocusError, type FocusErrorCode } from "./domain/errors.ts";
export type { Habit, HabitInput, FocusSession, PomodoroSettings } from "./domain/habit.ts";
