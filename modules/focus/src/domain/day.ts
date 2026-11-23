/**
 * Datas do calendário SEM hora: um "dia" é o texto `AAAA-MM-DD` na hora local da pessoa. É assim que as
 * marcações dos hábitos são gravadas, então o fuso é decidido na hora de marcar e o dia não "anda" depois.
 * Toda a aritmética aqui é feita em UTC sobre a data (sem horário de verão no meio), por isso é exata.
 */
export type Day = string;

const DAY_MS = 86_400_000;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** O dia local de um instante (ms desde 1970). `timeZone` é um nome IANA ("America/Sao_Paulo"); sem ele, o do aparelho. */
export function dayOf(ms: number, timeZone?: string): Day {
  const key = timeZone ?? "";
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      ...(timeZone ? { timeZone } : {}),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(key, formatter);
  }
  const part = (type: string) => formatter.formatToParts(ms).find((p) => p.type === type)?.value;
  return `${part("year")?.padStart(4, "0")}-${part("month")}-${part("day")}`;
}

/** Se o texto é um dia que existe no calendário. */
export function isDay(text: string): boolean {
  const match = DAY_PATTERN.exec(text);
  if (!match) return false;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, date));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === date
  );
}

function toUtc(day: Day): number {
  const match = DAY_PATTERN.exec(day);
  if (!match) throw new RangeError(`dia inválido: ${day}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function fromUtc(ms: number): Day {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Soma (ou subtrai, com negativo) dias a um dia. */
export function addDays(day: Day, amount: number): Day {
  return fromUtc(toUtc(day) + amount * DAY_MS);
}

/** Quantos dias de `from` até `to` (negativo se `to` for antes). */
export function daysBetween(from: Day, to: Day): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Dia da semana: 0 = domingo ... 6 = sábado. */
export function weekdayOf(day: Day): number {
  return new Date(toUtc(day)).getUTCDay();
}

export function isWeekend(day: Day): boolean {
  const weekday = weekdayOf(day);
  return weekday === 0 || weekday === 6;
}

/** A segunda-feira da semana do dia (as semanas aqui vão de segunda a domingo). */
export function mondayOf(day: Day): Day {
  return addDays(day, -((weekdayOf(day) + 6) % 7));
}

/** O mês (1 a 12) de um dia. */
export function monthOf(day: Day): number {
  return Number(day.slice(5, 7));
}
