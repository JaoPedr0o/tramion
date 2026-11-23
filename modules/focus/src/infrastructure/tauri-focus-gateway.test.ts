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
      "recordSession",
      () =>
        createTauriFocusGateway().recordSession({ startedAt: 5, durationSec: 60, noteId: null }),
      "session_record",
      { startedAt: 5, durationSec: 60, noteId: null },
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
