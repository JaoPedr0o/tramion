import { invoke } from "@tauri-apps/api/core";
import type { NotesGateway } from "../application/notes-gateway.ts";
import type { NoteSummary } from "../domain/note.ts";

/** Cumpre o contrato chamando o plugin Rust do módulo (`plugin:notes|<comando>`). */
export function createTauriNotesGateway(): NotesGateway {
  return {
    list: () => invoke<NoteSummary[]>("plugin:notes|list"),
  };
}
