import { createEventBus } from "@tramion/core";
import type { AppEvents } from "@tramion/contracts";
import { describe, expect, it, vi } from "vitest";
import { NotesError } from "../domain/errors.ts";
import { aNote, aSummary, gatewayStub } from "../test-support.ts";
import { createNotesService } from "./notes-service.ts";

/** Monta o serviço e devolve também o registro de tudo que foi publicado no barramento. */
function setup(gatewayOverrides = {}, onHandlerError = vi.fn()) {
  const events = createEventBus<AppEvents>({ onHandlerError });
  const published: Array<[string, { id: string }]> = [];
  for (const name of [
    "note.created",
    "note.updated",
    "note.moved",
    "note.deleted",
    "note.restored",
    "note.purged",
  ] as const) {
    events.on(name, (payload) => published.push([name, payload]));
  }
  const gateway = gatewayStub(gatewayOverrides);
  return { service: createNotesService({ gateway, events }), gateway, events, published };
}

describe("serviço de notas: eventos", () => {
  it("publica o evento certo, só com o id, depois de cada operação confirmada", async () => {
    const { service, published } = setup({
      create: vi.fn(async () => aNote({ id: "novo" })),
      update: vi.fn(async () => aNote({ id: "edit" })),
      setPinned: vi.fn(async () => aNote({ id: "fixa" })),
      move: vi.fn(async () => aNote({ id: "mov" })),
      setAppearance: vi.fn(async () => aNote({ id: "ap" })),
      delete: vi.fn(async () => ["d"]),
      restore: vi.fn(async () => ["r"]),
      purge: vi.fn(async () => ["p"]),
    });

    await service.create({ title: "a", body: "" });
    await service.update({ id: "edit", title: "a", body: "", content: "[]", expectedUpdatedAt: 1 });
    await service.setPinned("fixa", true);
    await service.move({ id: "mov", newParentId: null, index: 0 });
    await service.setAppearance({ id: "ap", icon: "🚀", cover: null });
    await service.delete("d");
    await service.restore("r");
    await service.purge("p");

    expect(published).toEqual([
      ["note.created", { id: "novo" }],
      ["note.updated", { id: "edit" }],
      ["note.updated", { id: "fixa" }],
      ["note.moved", { id: "mov" }],
      ["note.updated", { id: "ap" }],
      ["note.deleted", { id: "d" }],
      ["note.restored", { id: "r" }],
      ["note.purged", { id: "p" }],
    ]);
  });

  it("NÃO publica nada quando o gateway rejeita, e o erro sobe intacto", async () => {
    const conflict = new NotesError("notes.conflict", "versão velha");
    const { service, published } = setup({
      create: vi.fn(async () => Promise.reject(conflict)),
      update: vi.fn(async () => Promise.reject(conflict)),
      setPinned: vi.fn(async () => Promise.reject(conflict)),
      move: vi.fn(async () => Promise.reject(conflict)),
      setAppearance: vi.fn(async () => Promise.reject(conflict)),
      delete: vi.fn(async () => Promise.reject(conflict)),
      restore: vi.fn(async () => Promise.reject(conflict)),
      purge: vi.fn(async () => Promise.reject(conflict)),
    });

    const attempts = [
      service.create({ title: "a", body: "" }),
      service.update({ id: "x", title: "a", body: "", content: "[]", expectedUpdatedAt: 1 }),
      service.setPinned("x", true),
      service.move({ id: "x", newParentId: null, index: 0 }),
      service.setAppearance({ id: "x", icon: null, cover: null }),
      service.delete("x"),
      service.restore("x"),
      service.purge("x"),
    ];

    for (const attempt of attempts) await expect(attempt).rejects.toBe(conflict);
    expect(published).toEqual([]);
  });

  it("só publica DEPOIS que o gateway confirmou (não antes)", async () => {
    const log: string[] = [];
    let confirm!: () => void;
    const { service, events } = setup({
      delete: vi.fn(
        () =>
          new Promise<readonly string[]>((resolve) => {
            confirm = () => {
              log.push("gateway confirmou");
              resolve(["n1"]);
            };
          }),
      ),
    });
    events.on("note.deleted", () => log.push("evento publicado"));

    const pending = service.delete("n1");
    log.push("pedido enviado");
    expect(log).toEqual(["pedido enviado"]);

    confirm();
    await pending;

    expect(log).toEqual(["pedido enviado", "gateway confirmou", "evento publicado"]);
  });

  it("assinante com defeito não transforma uma operação bem-sucedida em falha", async () => {
    const onHandlerError = vi.fn();
    const { service, events } = setup({}, onHandlerError);
    const boom = new Error("listener quebrado");
    events.on("note.created", () => {
      throw boom;
    });
    const second = vi.fn();
    events.on("note.created", second);

    await expect(service.create({ title: "a", body: "" })).resolves.toBeDefined();

    expect(second).toHaveBeenCalledOnce();
    expect(onHandlerError).toHaveBeenCalledWith("note.created", boom);
  });
});

describe("serviço de notas: páginas com subpáginas", () => {
  it("publica um evento POR PÁGINA AFETADA ao excluir, restaurar e apagar de vez uma árvore", async () => {
    const { service, published } = setup({
      delete: vi.fn(async () => ["a", "b", "c"]),
      restore: vi.fn(async () => ["a", "b"]),
      purge: vi.fn(async () => ["x", "y"]),
    });

    await service.delete("a");
    await service.restore("a");
    await service.purge("x");

    expect(published).toEqual([
      ["note.deleted", { id: "a" }],
      ["note.deleted", { id: "b" }],
      ["note.deleted", { id: "c" }],
      ["note.restored", { id: "a" }],
      ["note.restored", { id: "b" }],
      ["note.purged", { id: "x" }],
      ["note.purged", { id: "y" }],
    ]);
  });

  it("operação repetida que não afeta ninguém não publica evento nenhum", async () => {
    const { service, published } = setup(); // o gateway padrão devolve []

    await service.delete("ja-na-lixeira");
    await service.restore("ja-ativa");

    expect(published).toEqual([]);
  });

  it("devolve ao chamador os ids afetados", async () => {
    const { service } = setup({ delete: vi.fn(async () => ["a", "b"]) });

    expect(await service.delete("a")).toEqual(["a", "b"]);
  });

  it("repassa o pedido de mover exatamente como veio", async () => {
    const { service, gateway } = setup();
    const input = { id: "p", newParentId: "pai", index: 3 };

    await service.move(input);

    expect(gateway.move).toHaveBeenCalledWith(input);
  });
});

describe("serviço de notas: leituras e repasse", () => {
  it("leituras não publicam eventos e repassam o resultado do gateway", async () => {
    const summary = aSummary({ id: "s", title: "t" });
    const { service, published, gateway } = setup({
      list: vi.fn(async () => [summary]),
      get: vi.fn(async () => aNote({ id: "g" })),
    });

    expect(await service.list()).toEqual([summary]);
    expect(await service.listTrash()).toEqual([]);
    expect((await service.get("g")).id).toBe("g");

    expect(gateway.get).toHaveBeenCalledWith("g");
    expect(published).toEqual([]);
  });

  it("repassa ao gateway exatamente o que a interface pediu", async () => {
    const { service, gateway } = setup();
    const input = { id: "x", title: "T", body: "B", content: "[]", expectedUpdatedAt: 42 };

    await service.update(input);
    await service.setPinned("x", true);

    expect(gateway.update).toHaveBeenCalledWith(input);
    expect(gateway.setPinned).toHaveBeenCalledWith("x", true);
  });

  describe("bases de dados", () => {
    it("criar base e criar linha publicam note.created; renomear publica note.updated", async () => {
      const { service, published } = setup({
        createDatabase: vi.fn(async () => aNote({ id: "db" })),
        createRow: vi.fn(async () => aNote({ id: "row" })),
        renameNote: vi.fn(async () => aNote({ id: "row" })),
      });

      await service.createDatabase({ title: "T", parentId: null });
      await service.createRow({ databaseId: "db", title: "L" });
      await service.renameNote({ id: "row", title: "X", expectedUpdatedAt: 1 });

      expect(published).toEqual([
        ["note.created", { id: "db" }],
        ["note.created", { id: "row" }],
        ["note.updated", { id: "row" }],
      ]);
    });

    it("colunas e células vão direto ao gateway, sem eventos", async () => {
      const property = {
        id: "p",
        databaseId: "db",
        name: "N",
        type: "text" as const,
        options: [],
        position: 0,
      };
      const { service, gateway, published } = setup({
        addProperty: vi.fn(async () => property),
        updateProperty: vi.fn(async () => property),
      });

      expect(await service.addProperty({ databaseId: "db", name: "N", type: "text" })).toBe(
        property,
      );
      expect(await service.updateProperty({ id: "p", name: "M" })).toBe(property);
      await service.deleteProperty("p");
      await service.setCell({ noteId: "n", propertyId: "p", value: "x" });
      await service.getDatabase("db");

      expect(gateway.deleteProperty).toHaveBeenCalledWith("p");
      expect(gateway.setCell).toHaveBeenCalledWith({ noteId: "n", propertyId: "p", value: "x" });
      expect(gateway.getDatabase).toHaveBeenCalledWith("db");
      expect(published).toEqual([]);
    });

    it("se o gateway recusar, o erro sobe e nenhum evento é publicado", async () => {
      const failure = new NotesError("notes.not-database", "x");
      const { service, published } = setup({
        createRow: vi.fn(async () => Promise.reject(failure)),
        renameNote: vi.fn(async () => Promise.reject(failure)),
      });

      await expect(service.createRow({ databaseId: "x", title: "L" })).rejects.toBe(failure);
      await expect(service.renameNote({ id: "x", title: "L", expectedUpdatedAt: 1 })).rejects.toBe(
        failure,
      );
      expect(published).toEqual([]);
    });
  });

  it("esvaziar a lixeira publica um note.purged por página apagada", async () => {
    const { service, published } = setup({ emptyTrash: vi.fn(async () => ["a", "b", "c"]) });

    expect(await service.emptyTrash()).toEqual(["a", "b", "c"]);

    expect(published).toEqual([
      ["note.purged", { id: "a" }],
      ["note.purged", { id: "b" }],
      ["note.purged", { id: "c" }],
    ]);
  });

  it("esvaziar uma lixeira vazia não publica nada; se falhar, o erro sobe sem eventos", async () => {
    const empty = setup({ emptyTrash: vi.fn(async () => []) });
    await empty.service.emptyTrash();
    expect(empty.published).toEqual([]);

    const failure = new NotesError("notes.internal", "x");
    const failing = setup({ emptyTrash: vi.fn(async () => Promise.reject(failure)) });
    await expect(failing.service.emptyTrash()).rejects.toBe(failure);
    expect(failing.published).toEqual([]);
  });
});
