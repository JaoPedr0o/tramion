import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FocusError } from "../domain/errors.ts";
import { toFocusError } from "./focus-error.ts";
import { createTauriFocusGateway } from "./tauri-focus-gateway.ts";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const invokeMock = vi.mocked(invoke);

const input = { name: "Ler", icon: null, frequency: "daily", timesPerWeek: null } as const;

// Fixam o QUE o TypeScript envia (nome do comando e dos argumentos). Que o Rust aceite exatamente isso
// só se prova rodando o app de verdade.
describe("gateway do Tauri (Foco)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it.each([
    [
      "listHabits",
      () => createTauriFocusGateway().listHabits(true),
      "habit_list",
      { includeArchived: true },
    ],
    ["createHabit", () => createTauriFocusGateway().createHabit(input), "habit_create", { input }],
    [
      "updateHabit",
      () => createTauriFocusGateway().updateHabit("h", input),
      "habit_update",
      { id: "h", input },
    ],
    [
      "archiveHabit",
      () => createTauriFocusGateway().archiveHabit("h", true),
      "habit_archive",
      { id: "h", archived: true },
    ],
    [
      "listChecks",
      () => createTauriFocusGateway().listChecks("2026-01-01", "2026-12-31"),
      "habit_checks",
      { from: "2026-01-01", to: "2026-12-31" },
    ],
    [
      "setCheck",
      () => createTauriFocusGateway().setCheck({ habitId: "h", day: "2026-11-18", done: true }),
      "habit_set_check",
      { habitId: "h", day: "2026-11-18", done: true },
    ],
    [
      "saveTimer",
      () =>
        createTauriFocusGateway().saveTimer({
          timer: {
            phase: "running",
            kind: "focus",
            startedAt: 5,
            durationMs: 60_000,
            endsAt: 60_005,
            noteId: null,
          },
          cycle: 2,
        }),
      "timer_set",
      {
        state: {
          phase: "running",
          kind: "focus",
          startedAt: 5,
          durationMs: 60_000,
          endsAt: 60_005,
          remainingMs: null,
          noteId: null,
          cycle: 2,
        },
      },
    ],
    [
      "saveTimer (parado)",
      () => createTauriFocusGateway().saveTimer({ timer: { phase: "idle" }, cycle: 3 }),
      "timer_set",
      {
        state: {
          phase: "idle",
          kind: null,
          startedAt: null,
          durationMs: null,
          endsAt: null,
          remainingMs: null,
          noteId: null,
          cycle: 3,
        },
      },
    ],
    [
      "listSessions",
      () => createTauriFocusGateway().listSessions({}),
      "session_list",
      { since: null, limit: null },
    ],
    ["getSettings", () => createTauriFocusGateway().getSettings(), "settings_get", undefined],
  ])("%s chama plugin:focus|%s", async (_name, run, command, args) => {
    await run();
    expect(invokeMock).toHaveBeenCalledWith(`plugin:focus|${command}`, args);
  });

  it("finishTimer devolve a sessão registrada (ou null se já estava concluído)", async () => {
    const session = { id: "s", startedAt: 5, durationSec: 60, noteId: null };
    invokeMock.mockResolvedValueOnce({ session });
    await expect(createTauriFocusGateway().finishTimer(1)).resolves.toEqual(session);
    expect(invokeMock).toHaveBeenCalledWith("plugin:focus|timer_finish", { cycle: 1 });
    invokeMock.mockResolvedValueOnce({ session: null });
    await expect(createTauriFocusGateway().finishTimer(1)).resolves.toBeNull();
  });

  it("getTimer lê o cronômetro rodando, pausado ou parado; o incoerente vira parado", async () => {
    const base = { kind: "break", startedAt: 9, durationMs: 300_000, noteId: null, cycle: 1 };
    invokeMock.mockResolvedValueOnce({ ...base, phase: "running", endsAt: 400, remainingMs: null });
    await expect(createTauriFocusGateway().getTimer()).resolves.toEqual({
      timer: {
        phase: "running",
        kind: "break",
        startedAt: 9,
        durationMs: 300_000,
        endsAt: 400,
        noteId: null,
      },
      cycle: 1,
    });
    invokeMock.mockResolvedValueOnce({ ...base, phase: "paused", endsAt: null, remainingMs: 7 });
    await expect(createTauriFocusGateway().getTimer()).resolves.toMatchObject({
      timer: { phase: "paused", remainingMs: 7 },
    });
    invokeMock.mockResolvedValueOnce({
      ...base,
      phase: "running",
      endsAt: null,
      remainingMs: null,
    });
    await expect(createTauriFocusGateway().getTimer()).resolves.toEqual({
      timer: { phase: "idle" },
      cycle: 1,
    });
    expect(invokeMock).toHaveBeenLastCalledWith("plugin:focus|timer_get", undefined);
  });

  it("converte erros do Rust em FocusError, e códigos desconhecidos em focus.internal", async () => {
    invokeMock.mockRejectedValueOnce({ code: "focus.name-invalid", message: "nome" });
    await expect(createTauriFocusGateway().createHabit(input)).rejects.toMatchObject({
      code: "focus.name-invalid",
    });
    invokeMock.mockRejectedValueOnce({ code: "outro.codigo", message: "x" });
    await expect(createTauriFocusGateway().getSettings()).rejects.toMatchObject({
      code: "focus.internal",
    });
    expect(toFocusError("texto solto")).toBeInstanceOf(FocusError);
    expect(toFocusError(new Error("boom")).message).toBe("boom");
  });
});
