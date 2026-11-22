import type { ViewContribution } from "@aun/contracts";
import { describe, expect, it } from "vitest";
import { AppError } from "./errors.ts";
import { createViewRegistry } from "./view-registry.ts";

function view(id: string): ViewContribution {
  return { id, title: id.toUpperCase(), component: () => null };
}

describe("createViewRegistry", () => {
  it("lista as telas na ordem de registro", () => {
    const views = createViewRegistry();
    views.register(view("notes"));
    views.register(view("tasks"));

    expect(views.list().map((v) => v.id)).toEqual(["notes", "tasks"]);
  });

  it("rejeita ids duplicados", () => {
    const views = createViewRegistry();
    views.register(view("notes"));

    try {
      views.register(view("notes"));
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).code).toBe("view.duplicate");
    }
  });

  it("devolve uma cópia: alterar a lista não altera o registro", () => {
    const views = createViewRegistry();
    views.register(view("notes"));

    (views.list() as ViewContribution[]).pop();

    expect(views.list()).toHaveLength(1);
  });
});
