import { describe, expect, it } from "vitest";
import { FocusError } from "../domain/errors.ts";
import type { HabitInput } from "../domain/habit.ts";
import { fakeClock, memoryGateway } from "../test-support.ts";
import { createHabitsStore, dailyCounts, lastDays, streakOf } from "./habits-store.ts";

const NOW = Date.UTC(2026, 10, 18, 15, 0, 0); // quarta, 18/11/2026
const daily = (name: string): HabitInput => ({
  name,
  icon: null,
  frequency: "daily",
  timesPerWeek: null,
});

function setup() {
  const clock = fakeClock(NOW);
  let failing: FocusError | null = null;
  const gateway = memoryGateway({ now: clock.now, failWith: () => failing });
  const store = createHabitsStore({ gateway, clock });
  return { clock, gateway, store, fail: (error: FocusError | null) => (failing = error) };
}

describe("store de hábitos", () => {
  it("começa vazio e carrega sem barulho", async () => {
    const { store } = setup();
    await store.reload();
    expect(store.getSnapshot()).toMatchObject({ habits: [], loaded: true, error: null });
  });

  it("cria, edita e arquiva", async () => {
    const { store } = setup();
    expect(await store.create(daily("Ler"))).toBe(true);
    const [habit] = store.getSnapshot().habits;
    expect(habit?.name).toBe("Ler");

    await store.update(habit!.id, { ...daily("Ler 20 min"), icon: "📖" });
    expect(store.getSnapshot().habits[0]).toMatchObject({ name: "Ler 20 min", icon: "📖" });

    await store.archive(habit!.id, true);
    expect(store.getSnapshot().habits).toHaveLength(0);
    await store.setShowArchived(true);
    expect(store.getSnapshot().habits).toHaveLength(1);
    expect(store.getSnapshot().habits[0]?.archivedAt).not.toBeNull();
    await store.archive(habit!.id, false);
    expect(store.getSnapshot().habits[0]?.archivedAt).toBeNull();
  });

  it("devolve falso e guarda o erro quando o Rust recusa", async () => {
    const { store } = setup();
    expect(await store.create(daily("   "))).toBe(false);
    expect(store.getSnapshot().error?.code).toBe("focus.name-invalid");
    store.clearError();
    expect(store.getSnapshot().error).toBeNull();
  });

  it("marcar com um toque é otimista e alterna", async () => {
    const { store, gateway } = setup();
    await store.create(daily("Água"));
    const id = store.getSnapshot().habits[0]!.id;

    const pending = store.toggle(id, "2026-11-18");
    expect(store.getSnapshot().checks.get(id)?.has("2026-11-18")).toBe(true); // antes de gravar
    await pending;
    expect(gateway.checks).toEqual([{ habitId: id, day: "2026-11-18" }]);

    await store.toggle(id, "2026-11-18");
    expect(store.getSnapshot().checks.get(id)?.has("2026-11-18")).toBe(false);
    expect(gateway.checks).toEqual([]);
  });

  it("desfaz a marca se a gravação falhar", async () => {
    const { store, fail } = setup();
    await store.create(daily("Água"));
    const id = store.getSnapshot().habits[0]!.id;
    fail(new FocusError("focus.internal", "falhou"));
    expect(await store.toggle(id, "2026-11-18")).toBe(false);
    expect(store.getSnapshot().checks.get(id)?.has("2026-11-18")).toBe(false);
    expect(store.getSnapshot().error?.code).toBe("focus.internal");
  });

  it("não deixa marcar dia futuro; dia passado pode (corrigir ontem)", async () => {
    const { store, gateway } = setup();
    await store.create(daily("Água"));
    const id = store.getSnapshot().habits[0]!.id;
    expect(await store.setCheck(id, "2026-11-19", true)).toBe(false);
    expect(await store.setCheck(id, "2026-11-17", true)).toBe(true);
    expect(gateway.checks).toHaveLength(1);
  });

  it("a virada do dia muda o que é 'hoje' sem recarregar nada", async () => {
    const { store, clock } = setup();
    expect(store.today()).toBe("2026-11-18");
    clock.set(Date.UTC(2026, 10, 18, 23, 59, 59));
    expect(store.today()).toBe("2026-11-18");
    clock.advance(1000);
    expect(store.today()).toBe("2026-11-19");
  });

  it("o fuso do relógio decide o dia da marca", async () => {
    const clock = fakeClock(Date.UTC(2026, 10, 18, 2, 30), "America/Sao_Paulo"); // ainda dia 17 em SP
    const gateway = memoryGateway({ now: clock.now });
    const store = createHabitsStore({ gateway, clock });
    await store.create(daily("Água"));
    const id = store.getSnapshot().habits[0]!.id;
    expect(store.today()).toBe("2026-11-17");
    expect(await store.setCheck(id, "2026-11-18", true)).toBe(false); // amanhã para quem está em SP
    expect(await store.setCheck(id, "2026-11-17", true)).toBe(true);
  });

  it("recarregar traz as marcações gravadas e a sequência bate com elas", async () => {
    const { store, gateway } = setup();
    await store.create(daily("Água"));
    const habit = store.getSnapshot().habits[0]!;
    for (const day of ["2026-11-16", "2026-11-17", "2026-11-18"]) {
      await gateway.setCheck({ habitId: habit.id, day, done: true });
    }
    await store.reload();
    const days = store.getSnapshot().checks.get(habit.id);
    expect(streakOf(habit, days, "2026-11-18")).toMatchObject({ current: 3, best: 3 });
  });
});

describe("auxiliares", () => {
  it("dailyCounts soma só hábitos ativos", () => {
    const base = {
      icon: null,
      frequency: "daily",
      timesPerWeek: null,
      createdAt: 1,
      updatedAt: 1,
    } as const;
    const habits = [
      { ...base, id: "a", name: "A", archivedAt: null },
      { ...base, id: "b", name: "B", archivedAt: null },
      { ...base, id: "c", name: "C", archivedAt: 5 },
    ];
    const checks = new Map([
      ["a", new Set(["2026-11-18", "2026-11-17"])],
      ["b", new Set(["2026-11-18"])],
      ["c", new Set(["2026-11-18"])],
    ]);
    expect(dailyCounts(habits, checks)).toEqual(
      new Map([
        ["2026-11-18", 2],
        ["2026-11-17", 1],
      ]),
    );
  });

  it("lastDays devolve os n últimos dias em ordem", () => {
    expect(lastDays("2026-11-18", 3)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
  });
});
