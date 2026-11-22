import type { NewNote, Note, NoteSummary, UpdateNote } from "../domain/note.ts";

/**
 * Contrato com o "mundo de fora" (o backend Rust). A aplicação e a interface só conhecem esta
 * interface; quem a cumpre pode ser o Tauri de verdade ou, nos testes, um falso.
 *
 * Toda operação que falha rejeita com um `NotesError` (o adaptador converte o que vier de fora).
 */
export interface NotesGateway {
  list(): Promise<readonly NoteSummary[]>;
  listTrash(): Promise<readonly NoteSummary[]>;
  get(id: string): Promise<Note>;
  create(input: NewNote): Promise<Note>;
  update(input: UpdateNote): Promise<Note>;
  setPinned(id: string, pinned: boolean): Promise<Note>;
  delete(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  purge(id: string): Promise<void>;
}
