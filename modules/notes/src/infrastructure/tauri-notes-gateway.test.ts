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
      "setAppearance",
      () =>
        createTauriNotesGateway().setAppearance({ id: "a", icon: "🚀", cover: "gradient:aurora" }),
      "plugin:notes|set_appearance",
      { id: "a", icon: "🚀", cover: "gradient:aurora" },
    ],
    [
      "setAppearance limpando",
      () => createTauriNotesGateway().setAppearance({ id: "a", icon: null, cover: null }),
      "plugin:notes|set_appearance",
      { id: "a", icon: null, cover: null },
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
        createTauriNotesGateway().update({
          id: "a",
          title: "T",
          body: "B",
          content: "[]",
          expectedUpdatedAt: 7,
        }),
      "plugin:notes|update",
      { id: "a", title: "T", body: "B", content: "[]", expectedUpdatedAt: 7 },
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

  it.each([
    [
      "createDatabase",
      () => createTauriNotesGateway().createDatabase({ title: "T", parentId: null }),
      "plugin:notes|create_database",
      { title: "T", parentId: null },
    ],
    [
      "getDatabase",
      () => createTauriNotesGateway().getDatabase("d"),
      "plugin:notes|get_database",
      { id: "d" },
    ],
    [
      "addProperty envia o tipo como `kind`",
      () => createTauriNotesGateway().addProperty({ databaseId: "d", name: "N", type: "select" }),
      "plugin:notes|add_property",
      { databaseId: "d", name: "N", kind: "select" },
    ],
    [
      "updateProperty só com nome",
      () => createTauriNotesGateway().updateProperty({ id: "p", name: "N" }),
      "plugin:notes|update_property",
      { id: "p", name: "N", options: null },
    ],
    [
      "updateProperty só com opções",
      () =>
        createTauriNotesGateway().updateProperty({
          id: "p",
          options: [{ id: "a", name: "A", color: "gray" }],
        }),
      "plugin:notes|update_property",
      { id: "p", name: null, options: [{ id: "a", name: "A", color: "gray" }] },
    ],
    [
      "deleteProperty",
      () => createTauriNotesGateway().deleteProperty("p"),
      "plugin:notes|delete_property",
      { id: "p" },
    ],
    [
      "createRow",
      () => createTauriNotesGateway().createRow({ databaseId: "d", title: "L" }),
      "plugin:notes|create_row",
      { databaseId: "d", title: "L" },
    ],
    [
      "setCell",
      () => createTauriNotesGateway().setCell({ noteId: "n", propertyId: "p", value: ["a"] }),
      "plugin:notes|set_cell",
      { noteId: "n", propertyId: "p", value: ["a"] },
    ],
    [
      "setCell esvaziando",
      () => createTauriNotesGateway().setCell({ noteId: "n", propertyId: "p", value: null }),
      "plugin:notes|set_cell",
      { noteId: "n", propertyId: "p", value: null },
    ],
    [
      "renameNote",
      () => createTauriNotesGateway().renameNote({ id: "n", title: "T", expectedUpdatedAt: 5 }),
      "plugin:notes|rename_note",
      { id: "n", title: "T", expectedUpdatedAt: 5 },
    ],
  ])("bases de dados: %s", async (_name, call, command, args) => {
    invokeMock.mockResolvedValue(undefined);

    await call();

    expect(invokeMock).toHaveBeenCalledWith(command, args);
  });

  it("esvaziar a lixeira chama o comando sem argumentos", async () => {
    invokeMock.mockResolvedValue(["a"]);

    expect(await createTauriNotesGateway().emptyTrash()).toEqual(["a"]);

    expect(invokeMock).toHaveBeenCalledWith("plugin:notes|empty_trash", undefined);
  });
});
