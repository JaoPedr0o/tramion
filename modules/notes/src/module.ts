import type { ModuleManifest } from "@aun/contracts";
import type { NotesGateway } from "./application/notes-gateway.ts";
import { createNavigationStore } from "./application/navigation-store.ts";
import { createNotesService } from "./application/notes-service.ts";
import { createTauriNotesGateway } from "./infrastructure/tauri-notes-gateway.ts";
import { createPageActions } from "./ui/actions.ts";
import type { ComponentType } from "react";
import type { BlockEditorProps } from "./ui/block-editor-types.ts";
import { createMain } from "./ui/createMain.tsx";
import { createSidebar } from "./ui/createSidebar.tsx";
import { createSidebarActions } from "./ui/createSidebarActions.tsx";
import { createTopbar } from "./ui/createTopbar.tsx";
import { LazyBlockEditor } from "./ui/LazyBlockEditor.ts";
import "./ui/notes.css";

/** Monta o módulo. O gateway é injetável para que os testes não precisem do Tauri. */
export function createNotesModule(
  gateway: NotesGateway = createTauriNotesGateway(),
  options: { BlockEditor?: ComponentType<BlockEditorProps> } = {},
): ModuleManifest {
  return {
    id: "notes",
    version: "0.1.0",
    register({ events, views }) {
      const service = createNotesService({ gateway, events });
      // O estado de navegação é compartilhado pelos quatro espaços da tela, que o app monta em lugares diferentes.
      const store = createNavigationStore();
      const deps = {
        service,
        events,
        store,
        actions: createPageActions(service, store),
        BlockEditor: options.BlockEditor ?? LazyBlockEditor,
      };

      views.register({
        id: "notes",
        title: "Páginas",
        sidebarActions: createSidebarActions(deps),
        sidebar: createSidebar(deps),
        topbar: createTopbar(deps),
        main: createMain(deps),
      });
    },
  };
}
