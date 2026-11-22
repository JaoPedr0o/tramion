import type { ModuleManifest } from "@aun/contracts";
import type { NotesGateway } from "./application/notes-gateway.ts";
import { createNotesService } from "./application/notes-service.ts";
import { createTauriNotesGateway } from "./infrastructure/tauri-notes-gateway.ts";
import { createNotesView } from "./ui/NotesView.tsx";

/** Monta o módulo. O gateway é injetável para que os testes não precisem do Tauri. */
export function createNotesModule(
  gateway: NotesGateway = createTauriNotesGateway(),
): ModuleManifest {
  return {
    id: "notes",
    version: "0.1.0",
    register({ events, views }) {
      const service = createNotesService({ gateway, events });
      views.register({ id: "notes", title: "Notas", component: createNotesView(service) });
    },
  };
}
