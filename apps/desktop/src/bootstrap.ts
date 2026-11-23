// Composition root (TypeScript): o ÚNICO lugar que conhece todos os módulos e os liga ao núcleo.
import type { AppEvents, ViewRegistry } from "@aesthetic/contracts";
import { createEventBus, createModuleRegistry, createViewRegistry } from "@aesthetic/core";
import { createNotesModule } from "@aesthetic/notes";

export function bootstrap(): { views: ViewRegistry } {
  const events = createEventBus<AppEvents>();
  const views = createViewRegistry();
  const registry = createModuleRegistry({ events, views });

  // Para adicionar um módulo ao produto: uma linha aqui. Para remover: apagar a linha.
  registry.add(createNotesModule());

  registry.start();
  return { views };
}
