import { describe, expect, it } from "vitest";
import type { DueTask } from "../domain/database.ts";
import {
  MAX_SCHEDULED,
  leadText,
  notificationIdOf,
  planScheduledNotifications,
  withUniqueIds,
} from "./scheduled-reminders.ts";

const at = (day: string, time: string) => new Date(`${day}T${time}:00`).getTime();
const NOW = at("2026-11-24", "12:00");

const task = (id: string, date: string, extra: Partial<DueTask> = {}): DueTask => ({
  id,
  title: `Tarefa ${id}`,
  icon: null,
  databaseId: "db",
  databaseTitle: "Tarefas",
  date,
  overdue: false,
  ...extra,
});

describe("notificationIdOf", () => {
  it("é estável e cabe em 31 bits", () => {
    expect(notificationIdOf("abc")).toBe(notificationIdOf("abc"));
    expect(notificationIdOf("abc")).not.toBe(notificationIdOf("abd"));
    for (const id of ["", "a", "uuid-1234-5678", "ação"]) {
      const value = notificationIdOf(id);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0x7fffffff);
    }
  });
});

describe("leadText", () => {
  it("fala em minutos, horas ou agora", () => {
    expect(leadText(0, "14:30")).toBe("Agora, às 14:30");
    expect(leadText(10, "14:30")).toBe("Daqui a 10 minutos, às 14:30");
    expect(leadText(60, "14:30")).toBe("Daqui a 1 hora, às 14:30");
    expect(leadText(120, "14:30")).toBe("Daqui a 2 horas, às 14:30");
  });
});

describe("planScheduledNotifications", () => {
  const plan = (tasks: DueTask[], leadMinutes = 10, limit?: number) =>
    planScheduledNotifications({
      tasks,
      now: NOW,
      leadMinutes,
      ...(limit === undefined ? {} : { limit }),
    });

  it("agenda a antecedência certa, com título e corpo", () => {
    const [item] = plan([task("a", "2026-11-24T14:30")]);

    expect(item).toEqual({
      id: notificationIdOf("a"),
      at: at("2026-11-24", "14:20"),
      title: "Tarefa a",
      body: "Daqui a 10 minutos, às 14:30 · Tarefas",
      taskId: "a",
    });
  });

  it("antecedência zero avisa na hora", () => {
    expect(plan([task("a", "2026-11-24T14:30")], 0)[0]!.at).toBe(at("2026-11-24", "14:30"));
  });

  it("ignora tarefas só com data e avisos que já passaram", () => {
    const list = plan([
      task("sem-hora", "2026-11-25"),
      task("passou", "2026-11-24T11:00"),
      task("aviso-passou", "2026-11-24T12:05"), // 12:05 - 10 min = 11:55, já passou
      task("agora", "2026-11-24T12:00"),
      task("vale", "2026-11-24T12:11"),
    ]);

    expect(list.map((i) => i.taskId)).toEqual(["vale"]);
  });

  it("ordena por horário e não repete a mesma tarefa", () => {
    const list = plan([
      task("b", "2026-11-26T09:00"),
      task("a", "2026-11-25T09:00"),
      task("b", "2026-11-26T09:00"),
    ]);

    expect(list.map((i) => i.taskId)).toEqual(["a", "b"]);
  });

  it("limita a quantidade, ficando com as mais próximas", () => {
    const many = Array.from({ length: MAX_SCHEDULED + 20 }, (_, index) =>
      task(`t${index}`, `2026-12-${String(1 + (index % 28)).padStart(2, "0")}T08:00`),
    );

    const list = plan(many);
    expect(list).toHaveLength(MAX_SCHEDULED);
    expect(list.map((i) => i.at)).toEqual([...list.map((i) => i.at)].sort((x, y) => x - y));
    expect(plan(many, 10, 3)).toHaveLength(3);
    expect(plan(many, 10, 0)).toEqual([]);
  });

  it("título vazio ganha um nome", () => {
    expect(plan([task("a", "2026-11-25T08:00", { title: "  " })])[0]!.title).toBe(
      "Tarefa sem título",
    );
  });

  it("ids repetidos (colisão de hash) ganham o próximo número livre, sem mexer nos demais", () => {
    const base = { at: NOW + 1, title: "t", body: "b" };
    const list = withUniqueIds([
      { ...base, id: 5, taskId: "a" },
      { ...base, id: 5, taskId: "b" },
      { ...base, id: 6, taskId: "c" },
      { ...base, id: 0x7fffffff, taskId: "d" },
      { ...base, id: 0x7fffffff, taskId: "e" },
    ]);

    expect(list.map((i) => i.id)).toEqual([5, 6, 7, 0x7fffffff, 0]);
  });
});
