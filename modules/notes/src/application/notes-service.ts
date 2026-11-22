import type { AppEvents, EventBus } from "@aun/contracts";
import type { NewNote, Note, NoteSummary, UpdateNote } from "../domain/note.ts";
import type { NotesGateway } from "./notes-gateway.ts";

/** Casos de uso do módulo de notas. É o que a interface usa. */
export interface NotesService {
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

/**
 * Cada operação que muda dados espera o gateway CONFIRMAR e só então publica o evento. Se o gateway
 * rejeitar, o erro sobe intacto e nenhum evento é publicado: quem escuta nunca reage a algo que
 * não aconteceu. As validações (título etc.) são do Rust; aqui não se repetem regras.
 */
export function createNotesService(deps: {
  gateway: NotesGateway;
  events: EventBus<AppEvents>;
}): NotesService {
  const { gateway, events } = deps;

  return {
    list: () => gateway.list(),
    listTrash: () => gateway.listTrash(),
    get: (id) => gateway.get(id),

    async create(input) {
      const note = await gateway.create(input);
      events.emit("note.created", { id: note.id });
      return note;
    },

    async update(input) {
      const note = await gateway.update(input);
      events.emit("note.updated", { id: note.id });
      return note;
    },

    async setPinned(id, pinned) {
      const note = await gateway.setPinned(id, pinned);
      events.emit("note.updated", { id: note.id });
      return note;
    },

    async delete(id) {
      await gateway.delete(id);
      events.emit("note.deleted", { id });
    },

    async restore(id) {
      await gateway.restore(id);
      events.emit("note.restored", { id });
    },

    async purge(id) {
      await gateway.purge(id);
      events.emit("note.purged", { id });
    },
  };
}
