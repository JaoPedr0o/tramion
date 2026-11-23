import { describe, expect, it } from "vitest";
import type { DatabaseRow } from "../domain/database.ts";
import {
  addMonths,
  groupByDate,
  isoOf,
  longDate,
  monthGrid,
  monthLabel,
  monthOf,
  todayIso,
} from "./calendar.ts";

const row = (id: string, cells: DatabaseRow["cells"] = {}): DatabaseRow => ({
  id,
  title: id,
  icon: null,
  updatedAt: 1,
  cells,
});

describe("isoOf e todayIso", () => {
  it("formata com zeros e normaliza dias fora do mês", () => {
    expect(isoOf(2026, 0, 5)).toBe("2026-01-05");
    expect(isoOf(2026, 11, 31)).toBe("2026-12-31");
    expect(isoOf(2026, 0, 0)).toBe("2025-12-31"); // dia 0 = último do mês anterior
    expect(isoOf(2026, 12, 1)).toBe("2027-01-01");
    expect(isoOf(2024, 1, 30)).toBe("2024-03-01"); // 2024 é bissexto
  });

  it("hoje usa o relógio local (dia, mês e ano da data recebida)", () => {
    expect(todayIso(new Date(2026, 10, 23, 23, 59))).toBe("2026-11-23");
    expect(todayIso(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });
});

describe("meses", () => {
  it("monthOf lê ano e mês (mês de 0 a 11)", () => {
    expect(monthOf("2026-11-23")).toEqual({ year: 2026, month: 10 });
    expect(monthOf("2025-01-01")).toEqual({ year: 2025, month: 0 });
  });

  it("addMonths vira o ano para a frente e para trás", () => {
    expect(addMonths({ year: 2026, month: 10 }, 1)).toEqual({ year: 2026, month: 11 });
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths({ year: 2026, month: 5 }, 0)).toEqual({ year: 2026, month: 5 });
    expect(addMonths({ year: 2026, month: 5 }, -18)).toEqual({ year: 2024, month: 11 });
    expect(addMonths({ year: 2026, month: 5 }, 30)).toEqual({ year: 2028, month: 11 });
  });

  it("rótulos em português", () => {
    expect(monthLabel({ year: 2026, month: 10 })).toBe("novembro de 2026");
    expect(monthLabel({ year: 2026, month: 2 })).toBe("março de 2026");
    expect(longDate("2026-11-05")).toBe("5 de novembro de 2026");
  });
});

describe("monthGrid", () => {
  it("novembro de 2026 começa num domingo e tem 5 semanas completas de domingo a sábado", () => {
    const grid = monthGrid({ year: 2026, month: 10 });

    expect(grid).toHaveLength(5);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0]![0]).toEqual({ iso: "2026-11-01", day: 1, inMonth: true });
    expect(grid[4]![1]).toEqual({ iso: "2026-11-30", day: 30, inMonth: true });
    expect(grid[4]![2]).toEqual({ iso: "2026-12-01", day: 1, inMonth: false });
    expect(grid[4]![6]!.iso).toBe("2026-12-05");
  });

  it("fevereiro de 2026 começa num domingo e tem 28 dias: 4 semanas sem dias de outros meses", () => {
    const grid = monthGrid({ year: 2026, month: 1 }); // fevereiro de 2026 começa num domingo e tem 28 dias

    expect(grid).toHaveLength(4);
    expect(grid[0]![0]!.iso).toBe("2026-02-01");
    expect(grid.flat().every((day) => day.inMonth)).toBe(true);
  });

  it("agosto de 2025 começa numa sexta: 6 semanas, e a primeira traz dias de julho", () => {
    const grid = monthGrid({ year: 2025, month: 7 }); // agosto de 2025 começa numa sexta; 31 dias

    expect(grid).toHaveLength(6);
    expect(grid[0]!.slice(0, 5).map((d) => d.iso)).toEqual([
      "2025-07-27",
      "2025-07-28",
      "2025-07-29",
      "2025-07-30",
      "2025-07-31",
    ]);
    expect(grid[0]!.slice(0, 5).every((d) => !d.inMonth)).toBe(true);
    expect(grid[0]![5]).toEqual({ iso: "2025-08-01", day: 1, inMonth: true });
  });

  it("o ano bissexto tem 29 dias em fevereiro; o comum, 28", () => {
    const inMonth = (cursor: { year: number; month: number }) =>
      monthGrid(cursor)
        .flat()
        .filter((d) => d.inMonth).length;

    expect(inMonth({ year: 2024, month: 1 })).toBe(29);
    expect(inMonth({ year: 2025, month: 1 })).toBe(28);
    expect(inMonth({ year: 1900, month: 1 })).toBe(28);
    expect(inMonth({ year: 2000, month: 1 })).toBe(29);
  });

  it("dezembro e janeiro cruzam o ano corretamente, sem datas repetidas nem faltando", () => {
    for (const cursor of [
      { year: 2026, month: 11 },
      { year: 2026, month: 0 },
    ]) {
      const flat = monthGrid(cursor).flat();
      const isos = flat.map((d) => d.iso);
      expect(new Set(isos).size).toBe(isos.length);
      expect([...isos].sort()).toEqual(isos); // em ordem crescente
      expect(flat.length % 7).toBe(0);
    }
    expect(monthGrid({ year: 2026, month: 11 }).flat().at(-1)!.iso.startsWith("2027-01")).toBe(
      true,
    );
  });

  it("todos os meses de vários anos têm de 4 a 6 semanas e o dia 1 na coluna do dia certo", () => {
    for (let year = 2023; year <= 2028; year++) {
      for (let month = 0; month < 12; month++) {
        const grid = monthGrid({ year, month });
        expect(grid.length).toBeGreaterThanOrEqual(4);
        expect(grid.length).toBeLessThanOrEqual(6);
        const first = grid.flat().find((d) => d.inMonth)!;
        expect(first.day).toBe(1);
        const column = grid[0]!.findIndex((d) => d.inMonth);
        expect(column).toBe(new Date(Date.UTC(year, month, 1)).getUTCDay());
      }
    }
  });
});

describe("groupByDate", () => {
  it("agrupa por data, mantém a ordem e separa as sem data", () => {
    const rows = [
      row("a", { prazo: "2026-11-05" }),
      row("b"),
      row("c", { prazo: "2026-11-05" }),
      row("d", { prazo: "2026-11-06" }),
      row("e", { prazo: "texto solto" }),
      row("f", { outra: "2026-11-05" }),
    ];

    const { byDate, undated } = groupByDate(rows, "prazo");

    expect(byDate.get("2026-11-05")!.map((r) => r.id)).toEqual(["a", "c"]);
    expect(byDate.get("2026-11-06")!.map((r) => r.id)).toEqual(["d"]);
    expect(undated.map((r) => r.id)).toEqual(["b", "e", "f"]);
  });

  it("sem linhas, tudo vazio", () => {
    const { byDate, undated } = groupByDate([], "prazo");

    expect(byDate.size).toBe(0);
    expect(undated).toEqual([]);
  });
});
