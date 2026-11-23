import { addDays, dayOf, type Day } from "../domain/day.ts";
import { FocusError } from "../domain/errors.ts";
import type { Habit, HabitInput } from "../domain/habit.ts";
import { computeStreak, type Streak } from "../domain/streak.ts";
import type { Clock, FocusGateway } from "./focus-gateway.ts";

export interface HabitsSnapshot {
  /** Ativos (e, se pedido, arquivados), na ordem de criação. */
  readonly habits: readonly Habit[];
  /** Os dias marcados de cada hábito. */
  readonly checks: ReadonlyMap<string, ReadonlySet<Day>>;
  readonly showArchived: boolean;
  readonly loaded: boolean;
  /** Último erro de leitura ou gravação (a interface o traduz em mensagem). */
  readonly error: FocusError | null;
}

/** Lê o histórico inteiro: são poucas linhas por hábito (uma por dia marcado) e a sequência precisa dele todo. */
const FROM: Day = "2000-01-01";
const TO: Day = "2100-12-31";

const asFocusError = (error: unknown): FocusError =>
  error instanceof FocusError ? error : new FocusError("focus.internal", String(error));

export interface HabitsStoreOptions {
  readonly gateway: FocusGateway;
  readonly clock: Clock;
}

/** O estado dos hábitos. Marcar é otimista (a tela responde na hora) e desfaz se a gravação falhar. */
export function createHabitsStore({ gateway, clock }: HabitsStoreOptions) {
  let state: HabitsSnapshot = {
    habits: [],
    checks: new Map(),
    showArchived: false,
    loaded: false,
    error: null,
  };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<HabitsSnapshot>) => {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) listener();
  };
  const today = () => dayOf(clock.now(), clock.timeZone);

  function withCheck(habitId: string, day: Day, done: boolean): ReadonlyMap<string, ReadonlySet<Day>> {
    const next = new Map(state.checks);
    const days = new Set(next.get(habitId) ?? []);
    if (done) days.add(day);
    else days.delete(day);
    next.set(habitId, days);
    return next;
  }

  async function reload() {
    try {
      const [habits, checks] = await Promise.all([
        gateway.listHabits(state.showArchived),
        gateway.listChecks(FROM, TO),
      ]);
      const byHabit = new Map<string, Set<Day>>();
      for (const check of checks) {
        const days = byHabit.get(check.habitId) ?? new Set<Day>();
        days.add(check.day);
        byHabit.set(check.habitId, days);
      }
      set({ habits, checks: byHabit, loaded: true, error: null });
    } catch (error) {
      set({ loaded: true, error: asFocusError(error) });
    }
  }

  /** Executa uma gravação; em caso de erro guarda o erro e devolve `false`. */
  async function attempt(action: () => Promise<unknown>): Promise<boolean> {
    try {
      await action();
      return true;
    } catch (error) {
      set({ error: asFocusError(error) });
      return false;
    }
  }

  /** Marca ou desmarca um dia. Dias futuros são recusados. Devolve se ficou do jeito pedido. */
  async function setCheck(habitId: string, day: Day, done: boolean): Promise<boolean> {
    if (day > today()) return false;
    set({ checks: withCheck(habitId, day, done), error: null });
    const ok = await attempt(() => gateway.setCheck({ habitId, day, done }));
    // Desfaz só esta marca (o resto pode ter mudado enquanto a gravação ia).
    if (!ok) set({ checks: withCheck(habitId, day, !done) });
    return ok;
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: (): HabitsSnapshot => state,
    today,
    reload,

    async create(input: HabitInput): Promise<boolean> {
      if (!(await attempt(() => gateway.createHabit(input)))) return false;
      await reload();
      return true;
    },

    async update(id: string, input: HabitInput): Promise<boolean> {
      if (!(await attempt(() => gateway.updateHabit(id, input)))) return false;
      await reload();
      return true;
    },

    async archive(id: string, archived: boolean): Promise<boolean> {
      if (!(await attempt(() => gateway.archiveHabit(id, archived)))) return false;
      await reload();
      return true;
    },

    async setShowArchived(showArchived: boolean) {
      set({ showArchived });
      await reload();
    },

    setCheck,

    /** Alterna o dia (um toque). */
    toggle(habitId: string, day: Day): Promise<boolean> {
      const done = state.checks.get(habitId)?.has(day) ?? false;
      return setCheck(habitId, day, !done);
    },

    clearError() {
      if (state.error) set({ error: null });
    },
  };
}

export type HabitsStore = ReturnType<typeof createHabitsStore>;

/** A sequência de um hábito, no dia de hoje do relógio informado. */
export function streakOf(habit: Habit, days: ReadonlySet<Day> | undefined, today: Day): Streak {
  return computeStreak({
    frequency: habit.frequency,
    timesPerWeek: habit.timesPerWeek,
    checks: days ?? [],
    today,
  });
}

/** Quantas marcações há em cada dia, somando os hábitos ATIVOS (para o mapa de calor geral). */
export function dailyCounts(
  habits: readonly Habit[],
  checks: ReadonlyMap<string, ReadonlySet<Day>>,
): Map<Day, number> {
  const counts = new Map<Day, number>();
  for (const habit of habits) {
    if (habit.archivedAt !== null) continue;
    for (const day of checks.get(habit.id) ?? []) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return counts;
}

/** Os últimos `n` dias terminando em `today` (do mais antigo ao mais novo). */
export function lastDays(today: Day, n: number): Day[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}
