import { createEventBus } from "@aun/core";
import type { AppEvents } from "@aun/contracts";
import { describe, expect, it, vi } from "vitest";
import { NotesError } from "../domain/errors.ts";
import { aNote, gatewayStub } from "../test-support.ts";
import { createNotesService } from "./notes-service.ts";

/** Monta o serviço e devolve também o registro de tudo que foi publicado no barramento. */
function setup(gatewayOverrides = {}, onHandlerError = vi.fn()) {
  const events = createEventBus<AppEvents>({ onHandlerError });
  const published: Array<[string, { id: string }]> = [];
  for (const name of [
    "note.created",
    "note.updated",
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
    });

    await service.create({ title: "a", body: "" });
    await service.update({ id: "edit", title: "a", body: "", expectedUpdatedAt: 1 });
    await service.setPinned("fixa", true);
    await service.delete("d");
    await service.restore("r");
    await service.purge("p");

    expect(published).toEqual([
      ["note.created", { id: "novo" }],
      ["note.updated", { id: "edit" }],
      ["note.updated", { id: "fixa" }],
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
      delete: vi.fn(async () => Promise.reject(conflict)),
      restore: vi.fn(async () => Promise.reject(conflict)),
      purge: vi.fn(async () => Promise.reject(conflict)),
    });

    const attempts = [
      service.create({ title: "a", body: "" }),
      service.update({ id: "x", title: "a", body: "", expectedUpdatedAt: 1 }),
      service.setPinned("x", true),
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
          new Promise<void>((resolve) => {
            confirm = () => {
              log.push("gateway confirmou");
              resolve();
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

describe("serviço de notas: leituras e repasse", () => {
  it("leituras não publicam eventos e repassam o resultado do gateway", async () => {
    const summary = { id: "s", title: "t", pinned: false, updatedAt: 1, deletedAt: null };
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
    const input = { id: "x", title: "T", body: "B", expectedUpdatedAt: 42 };

    await service.update(input);
    await service.setPinned("x", true);

    expect(gateway.update).toHaveBeenCalledWith(input);
    expect(gateway.setPinned).toHaveBeenCalledWith("x", true);
  });
});
