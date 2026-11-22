import { invoke } from "@tauri-apps/api/core";
import type { NotesGateway } from "../application/notes-gateway.ts";
import type { Note, NoteSummary } from "../domain/note.ts";
import { toNotesError } from "./notes-error.ts";

/** Chama um comando do plugin Rust (`plugin:notes|<comando>`) e padroniza o erro. */
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(`plugin:notes|${command}`, args);
  } catch (error) {
    throw toNotesError(error);
  }
}

/**
 * Cumpre o contrato chamando o Rust. O Tauri converte `camelCase` (aqui) em `snake_case` (no Rust):
 * `expectedUpdatedAt` chega como `expected_updated_at`.
 */
export function createTauriNotesGateway(): NotesGateway {
  return {
    list: () => call<NoteSummary[]>("list"),
    listTrash: () => call<NoteSummary[]>("list_trash"),
    get: (id) => call<Note>("get", { id }),
    create: ({ title, body }) => call<Note>("create", { title, body }),
    update: ({ id, title, body, expectedUpdatedAt }) =>
      call<Note>("update", { id, title, body, expectedUpdatedAt }),
    setPinned: (id, pinned) => call<Note>("set_pinned", { id, pinned }),
    delete: (id) => call<void>("delete", { id }),
    restore: (id) => call<void>("restore", { id }),
    purge: (id) => call<void>("purge", { id }),
  };
}
