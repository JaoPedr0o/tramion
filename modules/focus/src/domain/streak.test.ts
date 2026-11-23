import { describe, expect, it } from "vitest";
import { addDays, dayOf, type Day } from "./day.ts";
import { checksInWeek, computeStreak } from "./streak.ts";

// 2026-11-18 é quarta-feira. A semana (segunda a domingo) vai de 16 a 22.
const QUARTA: Day = "2026-11-18";

/** `n` dias seguidos terminando em `end` (inclusive). */
function run(end: Day, n: number): Day[] {
  return Array.from({ length: n }, (_, i) => addDays(end, -i));
}

const daily = (checks: Day[], today: Day) =>
  computeStreak({ frequency: "daily", timesPerWeek: null, checks, today });
const weekdays = (checks: Day[], today: Day) =>
  computeStreak({ frequency: "weekdays", timesPerWeek: null, checks, today });
const weekly = (n: number, checks: Day[], today: Day) =>
  computeStreak({ frequency: "weekly", timesPerWeek: n, checks, today });

describe("sequência: todo dia", () => {
  it("sem marcas, zero", () => {
    expect(daily([], QUARTA)).toEqual({ current: 0, best: 0, unit: "days" });
  });

  it("conta os dias seguidos até hoje", () => {
    expect(daily(run(QUARTA, 5), QUARTA)).toMatchObject({ current: 5, best: 5 });
  });

  it("hoje ainda aberto não quebra: a sequência até ontem continua valendo", () => {
    expect(daily(run("2026-11-17", 5), QUARTA)).toMatchObject({ current: 5, best: 5 });
  });

  it("um dia anterior sem marca quebra; só ontem e hoje não bastam", () => {
    // marcado: 12, 13, 14 | falta 15 e 16 | 17 e 18
    const checks = ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-17", "2026-11-18"];
    expect(daily(checks, QUARTA)).toMatchObject({ current: 2, best: 3 });
  });

  it("depois de dois dias sem marcar a sequência atual zera, mas a melhor fica", () => {
    expect(daily(run("2026-11-15", 4), QUARTA)).toMatchObject({ current: 0, best: 4 });
  });

  it("a melhor sequência pode estar no passado", () => {
    const old = run("2026-06-30", 10);
    const now = run(QUARTA, 3);
    expect(daily([...old, ...now], QUARTA)).toMatchObject({ current: 3, best: 10 });
  });

  it("ignora repetidos, ordem embaralhada e marcas de dias futuros", () => {
    const checks = [QUARTA, QUARTA, "2026-11-17", "2026-11-19", "2026-11-20"];
    expect(daily(checks.reverse(), QUARTA)).toMatchObject({ current: 2, best: 2 });
  });

  it("sequência longa atravessa mês, ano e fevereiro bissexto", () => {
    const today = "2028-03-02";
    const result = daily(run(today, 400), today);
    expect(result).toMatchObject({ current: 400, best: 400 });
  });

  it("uma marca só: vale 1 se for hoje ou ontem, 0 se for antes", () => {
    expect(daily([QUARTA], QUARTA).current).toBe(1);
    expect(daily(["2026-11-17"], QUARTA).current).toBe(1);
    expect(daily(["2026-11-16"], QUARTA)).toMatchObject({ current: 0, best: 1 });
  });
});

describe("sequência: virada do dia e fuso", () => {
  // O mesmo instante é "hoje" em um dia ou em outro conforme o fuso: quem chama passa o dia certo.
  const instant = Date.UTC(2026, 10, 18, 2, 30); // 23:30 de terça (17) em São Paulo, 02:30 de quarta (18) em UTC
  const checks = run("2026-11-17", 3);

  it("de 23:30 de terça em São Paulo, hoje é terça e a sequência de 3 inclui hoje", () => {
    const today = dayOf(instant, "America/Sao_Paulo");
    expect(today).toBe("2026-11-17");
    expect(daily(checks, today).current).toBe(3);
  });

  it("na mesma hora em UTC já é quarta: hoje fica aberto, a sequência continua em 3", () => {
    const today = dayOf(instant, "UTC");
    expect(today).toBe("2026-11-18");
    expect(daily(checks, today).current).toBe(3);
  });

  it("passada a meia-noite sem marcar, a sequência só quebra quando um dia INTEIRO passa em branco", () => {
    expect(daily(checks, "2026-11-18").current).toBe(3);
    expect(daily(checks, "2026-11-19").current).toBe(0);
  });
});

describe("sequência: dias úteis", () => {
  // sexta 13, sábado 14, domingo 15, segunda 16, terça 17, quarta 18
  it("fim de semana sem marca não quebra", () => {
    const checks = ["2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17", "2026-11-18"];
    expect(weekdays(checks, QUARTA)).toMatchObject({ current: 5, best: 5, unit: "days" });
  });

  it("fim de semana marcado conta como bônus e não quebra", () => {
    const checks = ["2026-11-13", "2026-11-14", "2026-11-16"];
    expect(weekdays(checks, "2026-11-16")).toMatchObject({ current: 3, best: 3 });
  });

  it("um dia útil em branco quebra", () => {
    // falta quinta 12 entre quarta 11 e sexta 13
    const checks = ["2026-11-11", "2026-11-13", "2026-11-16"];
    expect(weekdays(checks, "2026-11-16")).toMatchObject({ current: 2, best: 2 });
  });

  it("de segunda de manhã (aberta) a sequência de sexta continua", () => {
    const checks = ["2026-11-12", "2026-11-13"];
    expect(weekdays(checks, "2026-11-16")).toMatchObject({ current: 2, best: 2 });
  });

  it("hoje sendo sábado ou domingo sem marcar não conta nem quebra", () => {
    const checks = ["2026-11-19", "2026-11-20"]; // quinta e sexta
    expect(weekdays(checks, "2026-11-21").current).toBe(2);
    expect(weekdays(checks, "2026-11-22").current).toBe(2);
  });

  it("segunda sem marcar já na terça quebra", () => {
    const checks = ["2026-11-12", "2026-11-13"];
    expect(weekdays(checks, "2026-11-17")).toMatchObject({ current: 0, best: 2 });
  });
});

describe("sequência: N vezes por semana (em semanas)", () => {
  // Semanas: 9-15 (nov), 16-22, 23-29.
  it("conta semanas que bateram a meta", () => {
    const checks = [
      "2026-11-09",
      "2026-11-11",
      "2026-11-13", // semana de 9: 3
      "2026-11-16",
      "2026-11-18",
      "2026-11-20", // semana de 16: 3
    ];
    expect(weekly(3, checks, "2026-11-22")).toEqual({ current: 2, best: 2, unit: "weeks" });
  });

  it("a semana corrente ainda aberta (meta não batida) não quebra", () => {
    const checks = ["2026-11-09", "2026-11-11", "2026-11-13", "2026-11-16"];
    expect(weekly(3, checks, "2026-11-18")).toMatchObject({ current: 1, best: 1 });
  });

  it("a semana corrente soma assim que bate a meta", () => {
    const checks = [
      "2026-11-09",
      "2026-11-11",
      "2026-11-13",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
    ];
    expect(weekly(3, checks, "2026-11-18")).toMatchObject({ current: 2, best: 2 });
  });

  it("uma semana passada abaixo da meta quebra", () => {
    const checks = [
      "2026-11-02",
      "2026-11-03",
      "2026-11-04", // semana de 2: 3
      "2026-11-09",
      "2026-11-10", // semana de 9: só 2 (quebra)
      "2026-11-16",
      "2026-11-17",
      "2026-11-18", // semana de 16: 3
    ];
    expect(weekly(3, checks, "2026-11-22")).toMatchObject({ current: 1, best: 1 });
  });

  it("domingo pertence à semana que começou na segunda anterior", () => {
    // meta 2: sábado 14 + domingo 15 fecham a semana de 9; segunda 16 abre outra, ainda aberta.
    const checks = ["2026-11-14", "2026-11-15", "2026-11-16"];
    expect(weekly(2, checks, "2026-11-17")).toMatchObject({ current: 1, best: 1 });
    // Fechada a semana de 16 sem bater a meta, só a de 9 conta no passado e a sequência zera.
    expect(weekly(2, checks, "2026-11-23").current).toBe(0);
    // Sábado 14 sozinho não bate a meta 2 da semana de 9.
    expect(weekly(2, ["2026-11-14", "2026-11-16"], "2026-11-23").current).toBe(0);
  });

  it("meta 7 exige a semana inteira; passar da meta não conta em dobro", () => {
    const week = run("2026-11-22", 7);
    expect(weekly(7, week, "2026-11-22")).toMatchObject({ current: 1, best: 1 });
    expect(weekly(7, week.slice(1), "2026-11-22")).toMatchObject({ current: 0, best: 0 });
    expect(weekly(1, [...week, ...week], "2026-11-22")).toMatchObject({ current: 1, best: 1 });
  });

  it("semanas não consecutivas não se juntam na melhor sequência", () => {
    const checks = ["2026-10-05", "2026-10-06", "2026-10-19", "2026-10-20"];
    expect(weekly(2, checks, "2026-11-22")).toMatchObject({ current: 0, best: 1 });
  });

  it("sem meta informada, assume 1", () => {
    const result = computeStreak({
      frequency: "weekly",
      timesPerWeek: null,
      checks: ["2026-11-16"],
      today: "2026-11-18",
    });
    expect(result.current).toBe(1);
  });

  it("marcas de dias futuros não contam", () => {
    expect(weekly(2, ["2026-11-16", "2026-11-20"], "2026-11-18").current).toBe(0);
  });
});

describe("checksInWeek", () => {
  it("conta as marcas da semana (segunda a domingo) sem repetir", () => {
    const checks = ["2026-11-15", "2026-11-16", "2026-11-16", "2026-11-22", "2026-11-23"];
    expect(checksInWeek(checks, "2026-11-19")).toBe(2);
    expect(checksInWeek(checks, "2026-11-15")).toBe(1);
  });
});
