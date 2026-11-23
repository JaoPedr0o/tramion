import type { DatabaseRow } from "../domain/database.ts";

/** Data no formato `AAAA-MM-DD`, o mesmo das células de data. */
export type IsoDate = string;

export interface CalendarDay {
  readonly iso: IsoDate;
  /** Dia do mês (1 a 31). */
  readonly day: number;
  /** `false` para os dias de meses vizinhos que completam as semanas. */
  readonly inMonth: boolean;
}

export const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** A semana começa no domingo (o costume no Brasil). */
export const WEEKDAY_NAMES = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

export const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

export interface MonthCursor {
  readonly year: number;
  /** 0 = janeiro … 11 = dezembro. */
  readonly month: number;
}

const pad = (value: number, width: number) => String(value).padStart(width, "0");

/** `AAAA-MM-DD` a partir de ano, mês (0 a 11) e dia. Usa só UTC: o resultado não depende do fuso do computador. */
export function isoOf(year: number, month: number, day: number): IsoDate {
  return `${pad(new Date(Date.UTC(year, month, day)).getUTCFullYear(), 4)}-${pad(
    new Date(Date.UTC(year, month, day)).getUTCMonth() + 1,
    2,
  )}-${pad(new Date(Date.UTC(year, month, day)).getUTCDate(), 2)}`;
}

/** A data de hoje, no relógio local do computador. */
export function todayIso(now: Date = new Date()): IsoDate {
  return isoOf(now.getFullYear(), now.getMonth(), now.getDate());
}

/** O mês que contém uma data `AAAA-MM-DD`. */
export function monthOf(iso: IsoDate): MonthCursor {
  const [year, month] = iso.split("-").map(Number) as [number, number];
  return { year, month: month - 1 };
}

/** Anda `delta` meses (negativo volta), virando o ano quando preciso. */
export function addMonths(cursor: MonthCursor, delta: number): MonthCursor {
  const total = cursor.year * 12 + cursor.month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** "novembro de 2026". */
export function monthLabel(cursor: MonthCursor): string {
  return `${MONTH_NAMES[cursor.month]} de ${cursor.year}`;
}

/**
 * As semanas (linhas de 7 dias, de domingo a sábado) que cobrem o mês inteiro. Dias dos meses vizinhos completam a
 * primeira e a última semana. Tem de 4 a 6 linhas.
 */
export function monthGrid({ year, month }: MonthCursor): CalendarDay[][] {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const weeks = Math.ceil((firstWeekday + daysInMonth) / 7);

  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const date = new Date(Date.UTC(year, month, 1 - firstWeekday + week * 7 + weekday));
      const inMonth = date.getUTCMonth() === ((month % 12) + 12) % 12;
      return {
        iso: isoOf(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
        day: date.getUTCDate(),
        inMonth,
      };
    }),
  );
}

/** "5 de novembro de 2026" (para nomes acessíveis). */
export function longDate(iso: IsoDate): string {
  const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
  return `${day} de ${MONTH_NAMES[month - 1]} de ${year}`;
}

/** Linhas agrupadas pelo valor da coluna de data; as sem data (ou com valor que não é data) vão à parte. */
export function groupByDate(
  rows: readonly DatabaseRow[],
  propertyId: string,
): { byDate: ReadonlyMap<IsoDate, readonly DatabaseRow[]>; undated: readonly DatabaseRow[] } {
  const byDate = new Map<IsoDate, DatabaseRow[]>();
  const undated: DatabaseRow[] = [];
  for (const row of rows) {
    const value = row.cells[propertyId];
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const list = byDate.get(value) ?? [];
      list.push(row);
      byDate.set(value, list);
    } else {
      undated.push(row);
    }
  }
  return { byDate, undated };
}
