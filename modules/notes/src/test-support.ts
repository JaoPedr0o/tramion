// Auxiliares SÓ para testes (não fazem parte da API pública do módulo).
import { vi } from "vitest";
import type { NotesGateway } from "./application/notes-gateway.ts";
import { NotesError } from "./domain/errors.ts";
import type { Note, NoteSummary, TrashSummary } from "./domain/note.ts";

export function aNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "n1",
    title: "Título",
    body: "",
    content: "[]",
    pinned: false,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    parentId: null,
    position: 0,
    ...overrides,
  };
}

export function aSummary(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: "n1",
    title: "Título",
    pinned: false,
    updatedAt: 1,
    deletedAt: null,
    parentId: null,
    position: 0,
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
    move: vi.fn(async () => aNote()),
    delete: vi.fn(async () => []),
    restore: vi.fn(async () => []),
    purge: vi.fn(async () => []),
    ...overrides,
  };
}

/**
 * Gateway em memória que imita as regras do Rust: conflito de versão, hierarquia (pai, posição, mover
 * sem ciclos) e lixeira de subárvores (mesmo instante de exclusão). Existe para testar a interface sem
 * o app. ATENÇÃO: é uma IMITAÇÃO; se o Rust mudar, este arquivo precisa acompanhar. A prova de verdade
 * é rodar o app.
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
    parentId: n.parentId,
    position: n.position,
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
  const byPosition = (a: Note, b: Note) =>
    a.position - b.position || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
  const activeChildren = (parentId: string | null): Note[] =>
    [...notes.values()]
      .filter((n) => n.deletedAt === null && n.parentId === parentId)
      .sort(byPosition);
  const descendants = (id: string): string[] => {
    const found: string[] = [];
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const n of notes.values()) {
        if (n.parentId === current) {
          found.push(n.id);
          queue.push(n.id);
        }
      }
    }
    return found;
  };
  const renumber = (parentId: string | null, ids: string[]) =>
    ids.forEach((id, position) => notes.set(id, { ...notes.get(id)!, parentId, position }));
  const ensureActiveParent = (parentId: string | null) => {
    if (parentId === null) return;
    const parent = notes.get(parentId);
    if (!parent) throw new NotesError("notes.parent-not-found", "destino não existe");
    if (parent.deletedAt !== null)
      throw new NotesError("notes.parent-in-trash", "destino na lixeira");
  };

  const gateway: NotesGateway = {
    async list() {
      return [...notes.values()]
        .filter((n) => n.deletedAt === null)
        .sort(
          (a, b) =>
            Number(a.parentId !== null) - Number(b.parentId !== null) ||
            (a.parentId ?? "").localeCompare(b.parentId ?? "") ||
            byPosition(a, b),
        )
        .map(summary);
    },

    async listTrash(): Promise<readonly TrashSummary[]> {
      const trashed = [...notes.values()]
        .filter((n) => n.deletedAt !== null)
        .sort((a, b) => b.deletedAt! - a.deletedAt! || a.id.localeCompare(b.id));
      // Raiz de uma exclusão: sobe pela cadeia de pais com o MESMO instante de exclusão.
      const rootOf = (note: Note): Note => {
        let current = note;
        for (;;) {
          const parent = current.parentId ? notes.get(current.parentId) : undefined;
          if (!parent || parent.deletedAt === null || parent.deletedAt !== current.deletedAt)
            return current;
          current = parent;
        }
      };
      const counts = new Map<string, number>();
      for (const note of trashed) {
        const root = rootOf(note);
        if (root.id !== note.id) counts.set(root.id, (counts.get(root.id) ?? 0) + 1);
      }
      return trashed
        .filter((note) => rootOf(note).id === note.id)
        .map((note) => ({
          id: note.id,
          title: note.title,
          deletedAt: note.deletedAt!,
          descendantCount: counts.get(note.id) ?? 0,
        }));
    },

    async get(id) {
      return must(id);
    },

    async create({ title, body, parentId = null }) {
      const clean = cleanTitle(title);
      ensureActiveParent(parentId);
      const at = tick();
      const siblings = activeChildren(parentId);
      const note: Note = {
        id: `n${++seq}`,
        title: clean,
        body,
        content: "[]",
        pinned: false,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
        parentId,
        position: siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.position)) + 1,
      };
      notes.set(note.id, note);
      return note;
    },

    async update({ id, title, body, content, expectedUpdatedAt }) {
      const note = must(id);
      const clean = cleanTitle(title);
      if (note.deletedAt !== null) throw new NotesError("notes.in-trash", "lixeira");
      if (note.updatedAt !== expectedUpdatedAt) throw new NotesError("notes.conflict", "mudou");
      const next = { ...note, title: clean, body, content, updatedAt: tick() };
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

    async move({ id, newParentId, index }) {
      const note = must(id);
      if (note.deletedAt !== null) throw new NotesError("notes.in-trash", "lixeira");
      ensureActiveParent(newParentId);
      if (newParentId !== null && (newParentId === id || descendants(id).includes(newParentId))) {
        throw new NotesError("notes.cycle", "ciclo");
      }
      const destination = activeChildren(newParentId)
        .map((n) => n.id)
        .filter((other) => other !== id);
      destination.splice(Math.min(index, destination.length), 0, id);
      const oldParentId = note.parentId;
      renumber(newParentId, destination);
      if (oldParentId !== newParentId) {
        renumber(
          oldParentId,
          activeChildren(oldParentId).map((n) => n.id),
        );
      }
      return notes.get(id)!;
    },

    async delete(id) {
      const note = must(id);
      if (note.deletedAt !== null) return [];
      const stamp = tick();
      const affected = [id, ...descendants(id)].filter(
        (other) => notes.get(other)!.deletedAt === null,
      );
      for (const other of affected) notes.set(other, { ...notes.get(other)!, deletedAt: stamp });
      return affected;
    },

    async restore(id) {
      const note = must(id);
      const stamp = note.deletedAt;
      if (stamp === null) return [];
      const parent = note.parentId ? notes.get(note.parentId) : undefined;
      const newParentId = parent && parent.deletedAt === null ? parent.id : null;
      const siblings = activeChildren(newParentId);
      notes.set(id, {
        ...note,
        deletedAt: null,
        parentId: newParentId,
        position: siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.position)) + 1,
      });
      const affected = [id];
      const queue = [id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const n of notes.values()) {
          if (n.parentId === current && n.deletedAt === stamp) {
            notes.set(n.id, { ...n, deletedAt: null });
            affected.push(n.id);
            queue.push(n.id);
          }
        }
      }
      return affected;
    },

    async purge(id) {
      const note = must(id);
      if (note.deletedAt === null) throw new NotesError("notes.not-in-trash", "ativa");
      const affected = [id, ...descendants(id)].filter(
        (other) => notes.get(other)!.deletedAt !== null,
      );
      for (const other of affected) notes.delete(other);
      return affected;
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
