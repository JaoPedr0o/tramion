import type { AppEvents, EventBus, ModuleManifest, ViewRegistry } from "@tramion/contracts";
import { AppError } from "./errors.ts";

export interface ModuleRegistry {
  /** Cadastra um módulo. Só é possível antes de `start()`. */
  add(manifest: ModuleManifest): void;
  /** Registra todos os módulos respeitando `dependsOn`. Devolve a ordem usada. */
  start(): readonly string[];
}

export function createModuleRegistry(deps: {
  events: EventBus<AppEvents>;
  views: ViewRegistry;
}): ModuleRegistry {
  const manifests = new Map<string, ModuleManifest>();
  let started = false;

  /** Ordena por dependências (busca em profundidade), detectando faltas e ciclos. */
  function resolveOrder(): string[] {
    const order: string[] = [];
    const done = new Set<string>();
    const visiting: string[] = [];

    const visit = (id: string): void => {
      if (done.has(id)) return;
      const cycleStart = visiting.indexOf(id);
      if (cycleStart !== -1) {
        const path = [...visiting.slice(cycleStart), id].join(" → ");
        throw new AppError(
          "module.dependency-cycle",
          `Ciclo de dependências entre módulos: ${path}`,
        );
      }
      const manifest = manifests.get(id);
      if (!manifest) throw new Error(`erro interno: módulo "${id}" não encontrado`);

      visiting.push(id);
      for (const dep of manifest.dependsOn ?? []) {
        if (!manifests.has(dep)) {
          throw new AppError(
            "module.missing-dependency",
            `O módulo "${id}" depende de "${dep}", que não foi cadastrado.`,
          );
        }
        visit(dep);
      }
      visiting.pop();
      done.add(id);
      order.push(id);
    };

    for (const id of manifests.keys()) visit(id);
    return order;
  }

  return {
    add(manifest) {
      if (started) {
        throw new AppError(
          "module.registry-already-started",
          `Não é possível cadastrar "${manifest.id}": os módulos já foram iniciados.`,
        );
      }
      if (manifests.has(manifest.id)) {
        throw new AppError("module.duplicate", `Já existe um módulo com o id "${manifest.id}".`);
      }
      manifests.set(manifest.id, manifest);
    },

    start() {
      if (started) {
        throw new AppError("module.registry-already-started", "Os módulos já foram iniciados.");
      }
      // Valida tudo ANTES de registrar qualquer módulo: ou sobe tudo, ou nada começa.
      const order = resolveOrder();
      started = true;

      for (const id of order) {
        const manifest = manifests.get(id)!;
        try {
          manifest.register({ events: deps.events, views: deps.views });
        } catch (error) {
          throw new AppError("module.register-failed", `Falha ao registrar o módulo "${id}".`, {
            cause: error,
          });
        }
      }
      return order;
    },
  };
}
