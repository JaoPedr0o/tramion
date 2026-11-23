import type {
  MoveNote,
  NewNote,
  Note,
  NoteSummary,
  TrashSummary,
  UpdateNote,
} from "../domain/note.ts";

/**
 * Contrato com o "mundo de fora" (o backend Rust). A aplicação e a interface só conhecem esta
 * interface; quem a cumpre pode ser o Tauri de verdade ou, nos testes, um falso.
 *
 * Toda operação que falha rejeita com um `NotesError` (o adaptador converte o que vier de fora).
 */
export interface NotesGateway {
  /** Páginas ativas, PLANAS e ordenadas por posição; a árvore é montada a partir de `parentId`. */
  list(): Promise<readonly NoteSummary[]>;
  /** Só as raízes de cada exclusão, com a contagem de subpáginas excluídas junto. */
  listTrash(): Promise<readonly TrashSummary[]>;
  get(id: string): Promise<Note>;
  create(input: NewNote): Promise<Note>;
  update(input: UpdateNote): Promise<Note>;
  setPinned(id: string, pinned: boolean): Promise<Note>;
  move(input: MoveNote): Promise<Note>;
  /** `delete`, `restore` e `purge` devolvem os ids de TODAS as páginas afetadas (a página e as subpáginas). */
  delete(id: string): Promise<readonly string[]>;
  restore(id: string): Promise<readonly string[]>;
  purge(id: string): Promise<readonly string[]>;
}
