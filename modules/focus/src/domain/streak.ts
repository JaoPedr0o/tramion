import { addDays, isWeekend, mondayOf, type Day } from "./day.ts";
import type { Frequency } from "./habit.ts";

export interface StreakInput {
  readonly frequency: Frequency;
  /** Só vale na frequência semanal. */
  readonly timesPerWeek: number | null;
  /** Os dias marcados (qualquer ordem, pode repetir). */
  readonly checks: Iterable<Day>;
  /** O dia de hoje, já no fuso da pessoa (a virada do dia é decidida por quem chama). */
  readonly today: Day;
}

export interface Streak {
  /** A sequência em andamento. */
  readonly current: number;
  /** A maior sequência já feita. */
  readonly best: number;
  /** Dias (todo dia e dias úteis) ou semanas (N vezes por semana). */
  readonly unit: "days" | "weeks";
}

/**
 * Calcula a sequência de um hábito. Regras:
 * - O dia de HOJE ainda está aberto: se não foi marcado, não quebra a sequência (só deixa de somar).
 * - "Todo dia": um dia anterior sem marca quebra.
 * - "Dias úteis": sábado e domingo são folga (não quebram); se marcados, contam como bônus.
 * - "N vezes por semana": a sequência é de SEMANAS (segunda a domingo) com pelo menos N marcas. A semana
 *   corrente ainda aberta não quebra; se já bateu a meta, soma.
 * - Marcas de dias futuros são ignoradas.
 */
export function computeStreak(input: StreakInput): Streak {
  const done = new Set<Day>();
  for (const day of input.checks) if (day <= input.today) done.add(day);

  if (input.frequency === "weekly") {
    return weeklyStreak(done, Math.max(1, input.timesPerWeek ?? 1), input.today);
  }
  const required = (day: Day) => input.frequency === "daily" || !isWeekend(day);
  return dailyStreak(done, required, input.today);
}

function dailyStreak(done: Set<Day>, required: (day: Day) => boolean, today: Day): Streak {
  if (done.size === 0) return { current: 0, best: 0, unit: "days" };
  const sorted = [...done].sort();
  const oldest = sorted[0]!;

  // Em andamento: de hoje para trás.
  let current = 0;
  for (let day = today; day >= oldest; day = addDays(day, -1)) {
    if (done.has(day)) current++;
    else if (day === today || !required(day)) continue;
    else break;
  }

  // Melhor: percorre as marcas em ordem; duas marcas seguidas continuam a sequência se todo dia entre elas é folga.
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    let continues = true;
    for (let day = addDays(sorted[i - 1]!, 1); day < sorted[i]!; day = addDays(day, 1)) {
      if (required(day)) {
        continues = false;
        break;
      }
    }
    run = continues ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return { current, best, unit: "days" };
}

function weeklyStreak(done: Set<Day>, target: number, today: Day): Streak {
  const perWeek = new Map<Day, number>();
  for (const day of done) {
    const week = mondayOf(day);
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }
  const met = (week: Day) => (perWeek.get(week) ?? 0) >= target;

  const thisWeek = mondayOf(today);
  let current = met(thisWeek) ? 1 : 0;
  for (let week = addDays(thisWeek, -7); met(week); week = addDays(week, -7)) current++;

  const weeks = [...perWeek.keys()].filter(met).sort();
  let best = 0;
  let run = 0;
  weeks.forEach((week, index) => {
    run = index > 0 && addDays(weeks[index - 1]!, 7) === week ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return { current, best, unit: "weeks" };
}

/** Quantas marcas há na semana (segunda a domingo) do dia informado. */
export function checksInWeek(checks: Iterable<Day>, day: Day): number {
  const start = mondayOf(day);
  const end = addDays(start, 6);
  let count = 0;
  const seen = new Set<Day>();
  for (const check of checks) {
    if (check >= start && check <= end && !seen.has(check)) {
      seen.add(check);
      count++;
    }
  }
  return count;
}
