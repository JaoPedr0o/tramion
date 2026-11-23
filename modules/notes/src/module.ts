import type { ModuleManifest } from "@tramion/contracts";
import type { NotesGateway } from "./application/notes-gateway.ts";
import { createNavigationStore } from "./application/navigation-store.ts";
import type { EmojiData } from "./application/emoji.ts";
import type { NotesPlatform } from "./application/notes-platform.ts";
import { createNotesService } from "./application/notes-service.ts";
import { createTauriNotesGateway } from "./infrastructure/tauri-notes-gateway.ts";
import { createTauriNotesPlatform } from "./infrastructure/tauri-notes-platform.ts";
import { createPageActions } from "./ui/actions.ts";
import type { ComponentType } from "react";
import type { BlockEditorProps } from "./ui/block-editor-types.ts";
import { createMain } from "./ui/createMain.tsx";
import { createSidebar } from "./ui/createSidebar.tsx";
import { createSidebarActions } from "./ui/createSidebarActions.tsx";
import { createTopbar } from "./ui/createTopbar.tsx";
import { LazyBlockEditor } from "./ui/LazyBlockEditor.ts";
import { loadEmojiData } from "./ui/loadEmojiData.ts";
import "./ui/notes.css";

/** Monta o módulo. O gateway é injetável para que os testes não precisem do Tauri. */
export function createNotesModule(
  gateway: NotesGateway = createTauriNotesGateway(),
  options: {
    BlockEditor?: ComponentType<BlockEditorProps>;
    platform?: NotesPlatform;
    loadEmojiData?: () => Promise<EmojiData>;
  } = {},
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
        platform: options.platform ?? createTauriNotesPlatform(),
        loadEmojiData: options.loadEmojiData ?? loadEmojiData,
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
