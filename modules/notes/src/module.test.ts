import { createEventBus, createModuleRegistry, createViewRegistry } from "@tramion/core";
import { describe, expect, it } from "vitest";
import { createNotesModule } from "./module.ts";
import { gatewayStub } from "./test-support.ts";

describe("módulo de notas", () => {
  it("registra a tela 'Páginas' quando iniciado", () => {
    const views = createViewRegistry();
    const registry = createModuleRegistry({ events: createEventBus(), views });
    registry.add(createNotesModule(gatewayStub()));

    expect(registry.start()).toEqual(["notes"]);

    expect(views.list().map((v) => [v.id, v.title])).toEqual([["notes", "Notas"]]);
  });
});
