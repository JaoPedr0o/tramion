import { describe, expect, it } from "vitest";
import type { DueTask } from "../domain/database.ts";
import { digestMessage, isDigestDue, isValidTime, minutesOf, splitDue } from "./reminders.ts";

const task = (title: string, overdue: boolean): DueTask => ({
  id: title,
  title,
  icon: null,
  databaseId: "db",
  databaseTitle: "Tarefas",
  date: "2026-11-15",
  overdue,
});

describe("horário", () => {
  it("valida HH:MM de 00:00 a 23:59", () => {
    for (const ok of ["00:00", "09:00", "12:30", "23:59"]) expect(isValidTime(ok)).toBe(true);
    for (const bad of ["", "9:00", "24:00", "12:60", "12:5", "ab:cd", "12:30:00", "12h30"]) {
      expect(isValidTime(bad)).toBe(false);
    }
  });

  it("converte em minutos desde a meia-noite", () => {
    expect(minutesOf("00:00")).toBe(0);
    expect(minutesOf("09:30")).toBe(570);
    expect(minutesOf("23:59")).toBe(1439);
    expect(minutesOf("25:00")).toBeNull();
  });
});

describe("isDigestDue", () => {
  const at = (hours: number, minutes = 0) => new Date(2026, 10, 15, hours, minutes);
  const base = { time: "09:00", lastDigest: null, count: 2 };

  it("antes do horário não avisa; no horário e depois, avisa", () => {
    expect(isDigestDue({ ...base, now: at(8, 59) })).toBe(false);
    expect(isDigestDue({ ...base, now: at(9, 0) })).toBe(true);
    expect(isDigestDue({ ...base, now: at(17, 30) })).toBe(true);
  });

  it("só uma vez por dia: depois de avisar hoje, não avisa de novo; no dia seguinte, volta a avisar", () => {
    expect(isDigestDue({ ...base, now: at(10), lastDigest: "2026-11-15" })).toBe(false);
    expect(isDigestDue({ ...base, now: at(10), lastDigest: "2026-11-14" })).toBe(true);
  });

  it("sem tarefas ou com horário inválido, nunca avisa", () => {
    expect(isDigestDue({ ...base, now: at(10), count: 0 })).toBe(false);
    expect(isDigestDue({ ...base, now: at(10), time: "xx" })).toBe(false);
  });

  it("virada do dia à meia-noite (23:59 de um dia, 00:00 do outro)", () => {
    expect(
      isDigestDue({
        ...base,
        time: "00:00",
        now: new Date(2026, 10, 16, 0, 0),
        lastDigest: "2026-11-15",
      }),
    ).toBe(true);
  });
});

describe("textos", () => {
  it("separa atrasadas e de hoje", () => {
    const { overdue, today } = splitDue([task("A", true), task("B", false), task("C", true)]);

    expect(overdue.map((t) => t.title)).toEqual(["A", "C"]);
    expect(today.map((t) => t.title)).toEqual(["B"]);
  });

  it("mensagem com singular e plural, contagens e até três títulos", () => {
    expect(digestMessage([task("Pagar conta", false)])).toEqual({
      title: "1 tarefa pede atenção",
      body: "1 vence hoje: Pagar conta",
    });
    expect(digestMessage([task("A", true), task("B", true), task("C", false)])).toEqual({
      title: "3 tarefas pedem atenção",
      body: "2 atrasadas · 1 vence hoje: A, B, C",
    });
    expect(digestMessage([task("A", false), task("B", false)]).body).toBe("2 vencem hoje: A, B");
    expect(digestMessage([task("A", true)]).body).toBe("1 atrasada: A");
  });

  it("mais de três tarefas mostra 'e mais N'", () => {
    const tasks = ["A", "B", "C", "D", "E"].map((name) => task(name, true));

    expect(digestMessage(tasks).body).toBe("5 atrasadas: A, B, C e mais 2");
  });
});
