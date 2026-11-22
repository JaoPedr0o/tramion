// Auxiliares SÓ para testes (não fazem parte da API pública do módulo).
import { vi } from "vitest";
import type { NotesGateway } from "./application/notes-gateway.ts";
import { NotesError } from "./domain/errors.ts";
import type { Note, NoteSummary } from "./domain/note.ts";

export function aNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "n1",
    title: "Título",
    body: "",
    pinned: false,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

/** Gateway falso: cada método é um `vi.fn()` que, por padrão, dá certo. Sobrescreva o que precisar. */
export function gatewayStub(overrides: Partial<NotesGateway> = {}): NotesGateway {
  return {
    list: vi.fn(async () => []),
    listTrash: vi.fn(async () => []),
    get: vi.fn(async () => aNote()),
    create: vi.fn(async () => aNote()),
    update: vi.fn(async () => aNote()),
    setPinned: vi.fn(async () => aNote()),
    delete: vi.fn(async () => {}),
    restore: vi.fn(async () => {}),
    purge: vi.fn(async () => {}),
    ...overrides,
  };
}

/**
 * Gateway em memória que imita as regras do Rust (conflito de versão, lixeira, apagar de vez), para
 * testar a interface sem o app. ATENÇÃO: é uma imitação; se o Rust mudar, este arquivo precisa
 * acompanhar. A prova de verdade é rodar o app.
 */
export function createFakeGateway() {
  let seq = 0;
  let clock = 1_000;
  const notes = new Map<string, Note>();
  const tick = () => ++clock;

  const summary = (n: Note): NoteSummary => ({
    id: n.id,
    title: n.title,
    pinned: n.pinned,
    updatedAt: n.updatedAt,
    deletedAt: n.deletedAt,
  });
  const must = (id: string): Note => {
    const note = notes.get(id);
    if (!note) throw new NotesError("notes.not-found", "não existe");
    return note;
  };
  const cleanTitle = (title: string): string => {
    const trimmed = title.trim();
    if (!trimmed) throw new NotesError("notes.title-empty", "vazio");
    return trimmed;
  };

  const gateway: NotesGateway = {
    async list() {
      return [...notes.values()]
        .filter((n) => n.deletedAt === null)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
        .map(summary);
    },
    async listTrash() {
      return [...notes.values()]
        .filter((n) => n.deletedAt !== null)
        .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
        .map(summary);
    },
    async get(id) {
      return must(id);
    },
    async create({ title, body }) {
      const at = tick();
      const note: Note = {
        id: `n${++seq}`,
        title: cleanTitle(title),
        body,
        pinned: false,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
      };
      notes.set(note.id, note);
      return note;
    },
    async update({ id, title, body, expectedUpdatedAt }) {
      const note = must(id);
      const clean = cleanTitle(title);
      if (note.deletedAt !== null) throw new NotesError("notes.in-trash", "lixeira");
      if (note.updatedAt !== expectedUpdatedAt) throw new NotesError("notes.conflict", "mudou");
      const next = { ...note, title: clean, body, updatedAt: tick() };
      notes.set(id, next);
      return next;
    },
    async setPinned(id, pinned) {
      const note = must(id);
      if (note.deletedAt !== null) throw new NotesError("notes.in-trash", "lixeira");
      const next = { ...note, pinned };
      notes.set(id, next);
      return next;
    },
    async delete(id) {
      const note = must(id);
      if (note.deletedAt === null) notes.set(id, { ...note, deletedAt: tick() });
    },
    async restore(id) {
      const note = must(id);
      if (note.deletedAt !== null) notes.set(id, { ...note, deletedAt: null });
    },
    async purge(id) {
      const note = must(id);
      if (note.deletedAt === null) throw new NotesError("notes.not-in-trash", "ativa");
      notes.delete(id);
    },
  };

  return {
    gateway,
    notes,
    /** Simula uma edição vinda de outro lugar (outra janela, por exemplo): muda a nota e a versão. */
    touch(id: string, patch: Partial<Pick<Note, "title" | "body">>) {
      notes.set(id, { ...must(id), ...patch, updatedAt: tick() });
    },
  };
}
