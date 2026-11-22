import { createModuleRegistry, createEventBus, createViewRegistry } from "@aun/core";
import { describe, expect, it } from "vitest";
import { createNotesModule } from "./module.ts";

describe("módulo de notas", () => {
  it("registra a tela 'Notas' quando iniciado", () => {
    const views = createViewRegistry();
    const registry = createModuleRegistry({ events: createEventBus(), views });
    registry.add(createNotesModule({ list: async () => [] }));

    expect(registry.start()).toEqual(["notes"]);

    expect(views.list().map((v) => [v.id, v.title])).toEqual([["notes", "Notas"]]);
  });
});
