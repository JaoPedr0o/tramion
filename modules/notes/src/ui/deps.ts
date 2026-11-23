import type { AppEvents, EventBus } from "@aun/contracts";
import type { NavigationStore } from "../application/navigation-store.ts";
import type { NotesService } from "../application/notes-service.ts";
import type { ComponentType } from "react";
import type { EmojiData } from "../application/emoji.ts";
import type { NotesPlatform } from "../application/notes-platform.ts";
import type { createPageActions } from "./actions.ts";
import type { BlockEditorProps } from "./block-editor-types.ts";

/** Tudo que os componentes dos quatro espaços da tela precisam (cada espaço é montado separadamente pelo app). */
export interface NotesUiDeps {
  service: NotesService;
  events: EventBus<AppEvents>;
  store: NavigationStore;
  actions: ReturnType<typeof createPageActions>;
  /** O editor de blocos (o de verdade é carregado sob demanda; os testes passam um falso). */
  BlockEditor: ComponentType<BlockEditorProps>;
  /** O que o módulo usa do sistema (guardar arquivos, abrir links). */
  platform: NotesPlatform;
  /** Carrega a base de emojis do seletor de ícones (os testes passam uma base pequena). */
  loadEmojiData: () => Promise<EmojiData>;
}
