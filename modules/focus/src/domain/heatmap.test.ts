import { describe, expect, it } from "vitest";
import { buildHeatmap } from "./heatmap.ts";

describe("mapa de calor", () => {
  const today = "2026-11-18"; // quarta; a semana de hoje começa em 2026-11-16

  it("tem uma coluna por semana, com 7 dias de segunda a domingo, e a última coluna é a de hoje", () => {
    const map = buildHeatmap({ counts: new Map(), total: 1, today, weeks: 4 });
    expect(map.weeks).toHaveLength(4);
    expect(map.weeks.every((week) => week.length === 7)).toBe(true);
    expect(map.weeks[0]![0]!.day).toBe("2026-10-26");
    expect(map.weeks[3]![0]!.day).toBe("2026-11-16");
    expect(map.weeks[3]![6]!.day).toBe("2026-11-22");
  });

  it("marca como futuro o que vem depois de hoje, sem intensidade", () => {
    const map = buildHeatmap({
      counts: new Map([["2026-11-20", 3]]),
      total: 3,
      today,
      weeks: 2,
    });
    const last = map.weeks[1]!;
    expect(last.map((cell) => cell.future)).toEqual([false, false, false, true, true, true, true]);
    expect(last[4]).toMatchObject({ day: "2026-11-20", count: 0, level: 0 });
  });

  it("converte a fração de hábitos feitos em nível de 0 a 4", () => {
    const counts = new Map([
      ["2026-11-16", 0],
      ["2026-11-17", 1],
      ["2026-11-18", 2],
    ]);
    const levels = (total: number) =>
      buildHeatmap({ counts, total, today, weeks: 1 }).weeks[0]!.slice(0, 3).map((c) => c.level);
    expect(levels(4)).toEqual([0, 1, 2]);
    expect(levels(2)).toEqual([0, 2, 4]);
    expect(levels(1)).toEqual([0, 4, 4]); // passar do total satura em 4
    expect(levels(0)).toEqual([0, 0, 0]); // sem hábitos, nada acende
  });

  it("um pouquinho já acende o nível 1 (nunca arredonda para zero)", () => {
    const counts = new Map([["2026-11-17", 1]]);
    const cell = buildHeatmap({ counts, total: 100, today, weeks: 1 }).weeks[0]![1]!;
    expect(cell.level).toBe(1);
  });

  it("a virada do dia move a coluna final: no domingo e na segunda seguinte", () => {
    const sunday = buildHeatmap({ counts: new Map(), total: 1, today: "2026-11-22", weeks: 2 });
    expect(sunday.weeks[1]![0]!.day).toBe("2026-11-16");
    expect(sunday.weeks[1]!.some((cell) => cell.future)).toBe(false);
    const monday = buildHeatmap({ counts: new Map(), total: 1, today: "2026-11-23", weeks: 2 });
    expect(monday.weeks[1]![0]!.day).toBe("2026-11-23");
    expect(monday.weeks[1]!.slice(1).every((cell) => cell.future)).toBe(true);
  });

  it("rotula o começo de cada mês e a janela padrão cobre cerca de seis meses", () => {
    const map = buildHeatmap({ counts: new Map(), total: 1, today });
    expect(map.weeks).toHaveLength(26);
    const months = map.monthLabels.map((label) => label.month);
    expect(months.at(-1)).toBe(11);
    expect(new Set(months).size).toBe(months.length);
    // Em ordem de coluna, sem rótulos colados.
    const columns = map.monthLabels.map((label) => label.week);
    expect(columns).toEqual([...columns].sort((a, b) => a - b));
    for (let i = 1; i < columns.length; i++) expect(columns[i]! - columns[i - 1]!).toBeGreaterThanOrEqual(2);
  });

  it("atravessa a virada do ano", () => {
    const map = buildHeatmap({ counts: new Map(), total: 1, today: "2027-01-10", weeks: 6 });
    expect(map.monthLabels.map((label) => label.month)).toContain(1);
    expect(map.monthLabels.map((label) => label.month)).toContain(12);
  });
});
