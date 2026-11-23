import { addDays, mondayOf, monthOf, type Day } from "./day.ts";

export interface HeatCell {
  readonly day: Day;
  /** Quantas marcações no dia. */
  readonly count: number;
  /** Intensidade de 0 (nada) a 4 (tudo). */
  readonly level: 0 | 1 | 2 | 3 | 4;
  /** Depois de hoje (a célula existe só para completar a semana). */
  readonly future: boolean;
}

export interface Heatmap {
  /** Uma lista por semana (colunas), cada uma com 7 dias de segunda a domingo. */
  readonly weeks: readonly (readonly HeatCell[])[];
  /** Em que coluna começa cada mês. */
  readonly monthLabels: readonly { readonly week: number; readonly month: number }[];
}

export interface HeatmapInput {
  /** Marcações por dia (todos os hábitos somados, ou de um só). */
  readonly counts: ReadonlyMap<Day, number>;
  /** O que seria "tudo": quantos hábitos ativos (ou 1, para um hábito só). */
  readonly total: number;
  readonly today: Day;
  /** Quantas semanas mostrar (26 ≈ seis meses). */
  readonly weeks?: number;
}

function levelOf(count: number, total: number): HeatCell["level"] {
  if (count <= 0 || total <= 0) return 0;
  const level = Math.ceil((Math.min(count, total) / total) * 4);
  return Math.min(4, Math.max(1, level)) as HeatCell["level"];
}

/** Monta a grade do mapa de calor: a última coluna é a semana de hoje. Função pura (hoje vem de fora). */
export function buildHeatmap({ counts, total, today, weeks = 26 }: HeatmapInput): Heatmap {
  const first = addDays(mondayOf(today), -(weeks - 1) * 7);
  const columns: HeatCell[][] = [];
  for (let week = 0; week < weeks; week++) {
    const column: HeatCell[] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      const day = addDays(first, week * 7 + weekday);
      const count = counts.get(day) ?? 0;
      const future = day > today;
      column.push({
        day,
        count: future ? 0 : count,
        level: future ? 0 : levelOf(count, total),
        future,
      });
    }
    columns.push(column);
  }

  const monthLabels: { week: number; month: number }[] = [];
  columns.forEach((column, week) => {
    const month = monthOf(column[0]!.day);
    const previous = week > 0 ? monthOf(columns[week - 1]![0]!.day) : null;
    if (month !== previous) monthLabels.push({ week, month });
  });
  // Um mês que só aparece na primeira coluna por poucos dias não ganha rótulo (ficaria colado no seguinte).
  if (monthLabels.length > 1 && monthLabels[1]!.week - monthLabels[0]!.week < 2)
    monthLabels.shift();
  return { weeks: columns, monthLabels };
}
