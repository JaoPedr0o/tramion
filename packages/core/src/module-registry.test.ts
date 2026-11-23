import type { ModuleManifest } from "@tramion/contracts";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "./errors.ts";
import { createEventBus } from "./event-bus.ts";
import { createModuleRegistry } from "./module-registry.ts";
import { createViewRegistry } from "./view-registry.ts";

function newRegistry() {
  return createModuleRegistry({ events: createEventBus(), views: createViewRegistry() });
}

function manifest(id: string, dependsOn: string[] = [], register = () => {}): ModuleManifest {
  return { id, version: "1.0.0", dependsOn, register };
}

/** Executa e devolve o AppError lançado, para conferir o código. */
function codeOf(fn: () => void): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : "erro-desconhecido";
  }
  return undefined;
}

describe("createModuleRegistry", () => {
  it("registra os módulos depois das suas dependências", () => {
    const registry = newRegistry();
    registry.add(manifest("tasks", ["notes"]));
    registry.add(manifest("notes"));

    expect(registry.start()).toEqual(["notes", "tasks"]);
  });

  it("entrega o contexto (com o barramento) a cada módulo", () => {
    const register = vi.fn();
    const registry = newRegistry();
    registry.add(manifest("notes", [], register));

    registry.start();

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ events: expect.anything(), views: expect.anything() }),
    );
  });

  it("rejeita ids duplicados", () => {
    const registry = newRegistry();
    registry.add(manifest("notes"));

    expect(codeOf(() => registry.add(manifest("notes")))).toBe("module.duplicate");
  });

  it("rejeita dependência que não foi cadastrada, sem registrar nenhum módulo", () => {
    const register = vi.fn();
    const registry = newRegistry();
    registry.add(manifest("a", [], register));
    registry.add(manifest("b", ["fantasma"]));

    expect(codeOf(() => registry.start())).toBe("module.missing-dependency");
    expect(register).not.toHaveBeenCalled();
  });

  it("detecta ciclos e mostra o caminho", () => {
    const registry = newRegistry();
    registry.add(manifest("a", ["b"]));
    registry.add(manifest("b", ["c"]));
    registry.add(manifest("c", ["a"]));

    expect(codeOf(() => registry.start())).toBe("module.dependency-cycle");
    expect(() => registry.start()).toThrow(/a → b → c → a/);
  });

  it("embrulha falhas de registro preservando a causa original", () => {
    const original = new Error("banco indisponível");
    const registry = newRegistry();
    registry.add(
      manifest("notes", [], () => {
        throw original;
      }),
    );

    try {
      registry.start();
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("module.register-failed");
      expect((error as AppError).cause).toBe(original);
    }
  });

  it("não aceita cadastrar nem iniciar de novo depois de iniciado", () => {
    const registry = newRegistry();
    registry.start();

    expect(codeOf(() => registry.add(manifest("tarde")))).toBe("module.registry-already-started");
    expect(codeOf(() => registry.start())).toBe("module.registry-already-started");
  });
});
