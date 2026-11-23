import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./habit.ts";
import {
  IDLE,
  durationMsFor,
  formatClock,
  formatMinutes,
  isFinished,
  nextKind,
  pauseTimer,
  remainingMs,
  resumeTimer,
  startTimer,
} from "./pomodoro.ts";

const MIN = 60_000;

describe("cronômetro (pelo relógio, não por ticks)", () => {
  it("o tempo restante vem da hora de término", () => {
    const timer = startTimer("focus", 1_000, 25 * MIN);
    expect(remainingMs(timer, 1_000)).toBe(25 * MIN);
    expect(remainingMs(timer, 1_000 + 10 * MIN)).toBe(15 * MIN);
    // Um atraso grande (tela bloqueada) não desvia: ao voltar, o relógio diz a verdade.
    expect(remainingMs(timer, 1_000 + 24 * MIN + 59_000)).toBe(1_000);
  });

  it("termina exatamente na hora de término e nunca fica negativo", () => {
    const timer = startTimer("focus", 0, 5 * MIN);
    expect(isFinished(timer, 5 * MIN - 1)).toBe(false);
    expect(isFinished(timer, 5 * MIN)).toBe(true);
    expect(isFinished(timer, 99 * MIN)).toBe(true);
    expect(remainingMs(timer, 99 * MIN)).toBe(0);
  });

  it("se o relógio do sistema voltar para trás, o restante não passa da duração", () => {
    const timer = startTimer("focus", 100 * MIN, 25 * MIN);
    expect(remainingMs(timer, 50 * MIN)).toBe(25 * MIN);
  });

  it("pausar congela o restante; retomar recalcula o término", () => {
    const running = startTimer("focus", 0, 25 * MIN, "pagina-1");
    const paused = pauseTimer(running, 10 * MIN);
    expect(paused).toMatchObject({ phase: "paused", remainingMs: 15 * MIN, noteId: "pagina-1" });
    // Parado por horas, o restante não muda e nunca termina sozinho.
    expect(remainingMs(paused, 500 * MIN)).toBe(15 * MIN);
    expect(isFinished(paused, 500 * MIN)).toBe(false);

    const resumed = resumeTimer(paused, 60 * MIN);
    expect(resumed).toMatchObject({ phase: "running", startedAt: 0, endsAt: 75 * MIN });
    expect(isFinished(resumed, 75 * MIN)).toBe(true);
  });

  it("pausar duas vezes seguidas ou retomar sem pausa não faz nada", () => {
    const running = startTimer("break", 0, 5 * MIN);
    const paused = pauseTimer(running, MIN);
    expect(pauseTimer(paused, 2 * MIN)).toBe(paused);
    expect(resumeTimer(running, MIN)).toBe(running);
    expect(pauseTimer(IDLE, 0)).toBe(IDLE);
    expect(resumeTimer(IDLE, 0)).toBe(IDLE);
    expect(remainingMs(IDLE, 0)).toBe(0);
    expect(isFinished(IDLE, 1e12)).toBe(false);
  });

  it("pausar depois do fim guarda zero", () => {
    const paused = pauseTimer(startTimer("focus", 0, MIN), 5 * MIN);
    expect(paused).toMatchObject({ remainingMs: 0 });
  });
});

describe("o que vem depois", () => {
  it("sem pausa longa ligada, sempre pausa curta depois do foco", () => {
    for (let done = 1; done <= 8; done++) expect(nextKind("focus", done, DEFAULT_SETTINGS)).toBe("break");
  });

  it("com pausa longa a cada 4, a quarta sessão leva à pausa longa", () => {
    const settings = { ...DEFAULT_SETTINGS, longBreakEvery: 4 };
    expect([1, 2, 3, 4, 5, 8].map((n) => nextKind("focus", n, settings))).toEqual([
      "break",
      "break",
      "break",
      "long-break",
      "break",
      "long-break",
    ]);
  });

  it("depois de qualquer pausa volta o foco", () => {
    expect(nextKind("break", 3, DEFAULT_SETTINGS)).toBe("focus");
    expect(nextKind("long-break", 4, DEFAULT_SETTINGS)).toBe("focus");
  });

  it("durações vêm dos ajustes", () => {
    const s = { ...DEFAULT_SETTINGS, focusMin: 50, breakMin: 10, longBreakMin: 30 };
    expect(durationMsFor("focus", s)).toBe(50 * MIN);
    expect(durationMsFor("break", s)).toBe(10 * MIN);
    expect(durationMsFor("long-break", s)).toBe(30 * MIN);
  });
});

describe("formatação", () => {
  it("relógio arredondando para cima", () => {
    expect(formatClock(25 * MIN)).toBe("25:00");
    expect(formatClock(25 * MIN - 1)).toBe("25:00");
    expect(formatClock(59_001)).toBe("01:00");
    expect(formatClock(1)).toBe("00:01");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(-5)).toBe("00:00");
    expect(formatClock(90 * MIN)).toBe("1:30:00");
  });

  it("minutos acumulados", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(25 * 60)).toBe("25 min");
    expect(formatMinutes(60 * 60)).toBe("1 h");
    expect(formatMinutes(75 * 60)).toBe("1 h 15 min");
  });
});
