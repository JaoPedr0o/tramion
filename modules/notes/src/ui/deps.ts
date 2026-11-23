import type { AppEvents, EventBus } from "@aun/contracts";
import type { NavigationStore } from "../application/navigation-store.ts";
import type { NotesService } from "../application/notes-service.ts";
import type { createPageActions } from "./actions.ts";

/** Tudo que os componentes dos quatro espaços da tela precisam (cada espaço é montado separadamente pelo app). */
export interface NotesUiDeps {
  service: NotesService;
  events: EventBus<AppEvents>;
  store: NavigationStore;
  actions: ReturnType<typeof createPageActions>;
}
