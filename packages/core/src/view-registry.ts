import type { ViewContribution, ViewRegistry } from "@tramion/contracts";
import { AppError } from "./errors.ts";

export function createViewRegistry(): ViewRegistry {
  const views = new Map<string, ViewContribution>();

  return {
    register(view) {
      if (views.has(view.id)) {
        throw new AppError("view.duplicate", `Já existe uma tela com o id "${view.id}".`);
      }
      views.set(view.id, view);
    },

    // Devolve uma cópia: quem consulta não consegue alterar o registro por fora.
    list() {
      return [...views.values()];
    },
  };
}
