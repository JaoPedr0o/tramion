import { describe, expect, it } from "vitest";
import {
  addDays,
  dayOf,
  daysBetween,
  isDay,
  isWeekend,
  mondayOf,
  monthOf,
  weekdayOf,
} from "./day.ts";

describe("dayOf (virada do dia e fuso)", () => {
  // 2026-11-20 02:30 UTC = 23:30 do dia 19 em São Paulo (UTC-3) e 11:30 do dia 20 em Tóquio (UTC+9).
  const instant = Date.UTC(2026, 10, 20, 2, 30);

  it("o mesmo instante cai em dias diferentes conforme o fuso", () => {
    expect(dayOf(instant, "UTC")).toBe("2026-11-20");
    expect(dayOf(instant, "America/Sao_Paulo")).toBe("2026-11-19");
    expect(dayOf(instant, "Asia/Tokyo")).toBe("2026-11-20");
  });

  it("vira o dia exatamente à meia-noite local", () => {
    const tz = "America/Sao_Paulo";
    const midnight = Date.UTC(2026, 10, 20, 3, 0); // 00:00 local do dia 20
    expect(dayOf(midnight - 1, tz)).toBe("2026-11-19");
    expect(dayOf(midnight, tz)).toBe("2026-11-20");
  });

  it("vira o dia na virada do ano e em ano bissexto", () => {
    expect(dayOf(Date.UTC(2026, 11, 31, 23, 59, 59), "UTC")).toBe("2026-12-31");
    expect(dayOf(Date.UTC(2027, 0, 1, 0, 0, 0), "UTC")).toBe("2027-01-01");
    expect(dayOf(Date.UTC(2028, 1, 29, 12), "UTC")).toBe("2028-02-29");
  });

  it("horário de verão: o dia que muda de 23h para 25h continua um único dia", () => {
    // Nova York volta o relógio em 2026-11-01 (dia de 25 horas).
    const tz = "America/New_York";
    expect(dayOf(Date.UTC(2026, 10, 1, 4, 30), tz)).toBe("2026-11-01"); // 00:30 EDT
    expect(dayOf(Date.UTC(2026, 10, 2, 4, 59), tz)).toBe("2026-11-01"); // 23:59 EST
    expect(dayOf(Date.UTC(2026, 10, 2, 5, 0), tz)).toBe("2026-11-02");
  });
});

describe("aritmética de dias", () => {
  it("soma e subtrai atravessando mês, ano e bissexto", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2026-11-20", 0)).toBe("2026-11-20");
  });

  it("conta dias entre datas (sem sofrer com horário de verão)", () => {
    expect(daysBetween("2026-11-01", "2026-11-08")).toBe(7);
    expect(daysBetween("2026-11-08", "2026-11-01")).toBe(-7);
    expect(daysBetween("2026-03-01", "2027-03-01")).toBe(365);
  });

  it("dia da semana, fim de semana e segunda-feira da semana", () => {
    expect(weekdayOf("2026-11-22")).toBe(0); // domingo
    expect(weekdayOf("2026-11-23")).toBe(1); // segunda
    expect(isWeekend("2026-11-21")).toBe(true);
    expect(isWeekend("2026-11-22")).toBe(true);
    expect(isWeekend("2026-11-23")).toBe(false);
    expect(mondayOf("2026-11-22")).toBe("2026-11-16"); // domingo pertence à semana anterior
    expect(mondayOf("2026-11-23")).toBe("2026-11-23");
    expect(mondayOf("2026-11-26")).toBe("2026-11-23");
    expect(monthOf("2026-03-09")).toBe(3);
  });

  it("valida dias", () => {
    expect(isDay("2026-02-28")).toBe(true);
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("2026-1-1")).toBe(false);
    expect(isDay("")).toBe(false);
  });

  it("recusa dia inválido na aritmética", () => {
    expect(() => addDays("lixo", 1)).toThrow(RangeError);
  });
});
