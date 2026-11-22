// Auxiliares SÓ para testes (não fazem parte da API pública do módulo).
import { vi } from "vitest";
import type { NotesGateway } from "./application/notes-gateway.ts";
import type { Note } from "./domain/note.ts";

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
