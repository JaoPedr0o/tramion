import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotesError } from "../domain/errors.ts";
import { createTauriNotesGateway } from "./tauri-notes-gateway.ts";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const invokeMock = vi.mocked(invoke);

// Estes testes fixam o QUE o TypeScript envia (nome do comando e dos argumentos). Que o Rust
// aceite exatamente isso só se prova rodando o app de verdade: ver o passo 5d.
describe("gateway do Tauri", () => {
  // Atenção às chaves: o que um `beforeEach` DEVOLVE o Vitest executa como função de limpeza.
  // Sem elas, o hook devolveria o próprio mock e o chamaria depois de cada teste.
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it.each([
    ["list", () => createTauriNotesGateway().list(), "plugin:notes|list", undefined],
    [
      "listTrash",
      () => createTauriNotesGateway().listTrash(),
      "plugin:notes|list_trash",
      undefined,
    ],
    ["get", () => createTauriNotesGateway().get("a"), "plugin:notes|get", { id: "a" }],
    [
      "create",
      () => createTauriNotesGateway().create({ title: "T", body: "B" }),
      "plugin:notes|create",
      { title: "T", body: "B", parentId: null },
    ],
    [
      "create com pai",
      () => createTauriNotesGateway().create({ title: "T", body: "B", parentId: "p" }),
      "plugin:notes|create",
      { title: "T", body: "B", parentId: "p" },
    ],
    [
      "move",
      () => createTauriNotesGateway().move({ id: "a", newParentId: null, index: 2 }),
      "plugin:notes|move_note",
      { id: "a", newParentId: null, index: 2 },
    ],
    [
      "update",
      () =>
        createTauriNotesGateway().update({ id: "a", title: "T", body: "B", expectedUpdatedAt: 7 }),
      "plugin:notes|update",
      { id: "a", title: "T", body: "B", expectedUpdatedAt: 7 },
    ],
    [
      "setPinned",
      () => createTauriNotesGateway().setPinned("a", true),
      "plugin:notes|set_pinned",
      { id: "a", pinned: true },
    ],
    ["delete", () => createTauriNotesGateway().delete("a"), "plugin:notes|delete", { id: "a" }],
    ["restore", () => createTauriNotesGateway().restore("a"), "plugin:notes|restore", { id: "a" }],
    ["purge", () => createTauriNotesGateway().purge("a"), "plugin:notes|purge", { id: "a" }],
  ])("%s chama o comando certo com os argumentos certos", async (_name, run, command, args) => {
    invokeMock.mockResolvedValue(undefined);

    await run();

    expect(invokeMock).toHaveBeenCalledWith(command, args);
  });

  it("devolve o resultado do Rust", async () => {
    invokeMock.mockResolvedValue([{ id: "x" }]);

    expect(await createTauriNotesGateway().list()).toEqual([{ id: "x" }]);
  });

  it("converte a rejeição do Tauri em NotesError", async () => {
    invokeMock.mockImplementation(async () => {
      throw { code: "notes.title-empty", message: "o título não pode ser vazio" };
    });

    // Captura o erro uma única vez e afirma sobre ele.
    const error = await createTauriNotesGateway()
      .create({ title: "", body: "" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotesError);
    expect(error).toHaveProperty("code", "notes.title-empty");
  });
});
