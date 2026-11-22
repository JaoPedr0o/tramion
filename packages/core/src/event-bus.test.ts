import { describe, expect, it, vi } from "vitest";
import { createEventBus } from "./event-bus.ts";

// Catálogo de eventos usado só nestes testes.
interface TestEvents {
  "note.created": { id: string };
  "app.ready": undefined;
}

describe("createEventBus", () => {
  it("entrega o conteúdo aos assinantes, na ordem de assinatura", () => {
    const bus = createEventBus<TestEvents>();
    const calls: string[] = [];
    bus.on("note.created", (p) => calls.push(`A:${p.id}`));
    bus.on("note.created", (p) => calls.push(`B:${p.id}`));

    bus.emit("note.created", { id: "1" });

    expect(calls).toEqual(["A:1", "B:1"]);
  });

  it("só chama quem assinou aquele evento", () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    bus.on("app.ready", handler);

    bus.emit("note.created", { id: "1" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("para de entregar depois de cancelar a assinatura", () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    const unsubscribe = bus.on("note.created", handler);

    bus.emit("note.created", { id: "1" });
    unsubscribe();
    bus.emit("note.created", { id: "2" });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("isola falhas: um assinante que lança erro não afeta quem publicou nem os demais", () => {
    const onHandlerError = vi.fn();
    const bus = createEventBus<TestEvents>({ onHandlerError });
    const boom = new Error("falhou");
    const after = vi.fn();
    bus.on("note.created", () => {
      throw boom;
    });
    bus.on("note.created", after);

    expect(() => bus.emit("note.created", { id: "1" })).not.toThrow();

    expect(after).toHaveBeenCalledOnce();
    expect(onHandlerError).toHaveBeenCalledWith("note.created", boom);
  });

  it("permite cancelar a própria assinatura durante a publicação", () => {
    const bus = createEventBus<TestEvents>();
    const other = vi.fn();
    const unsubscribe = bus.on("note.created", () => unsubscribe());
    bus.on("note.created", other);

    bus.emit("note.created", { id: "1" });

    expect(other).toHaveBeenCalledOnce();
  });
});
