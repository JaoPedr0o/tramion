// API pública do módulo de notas. Tudo que não é exportado aqui é privado.
export { createNotesModule } from "./module.ts";
export type { NotesGateway } from "./application/notes-gateway.ts";
export type { Note, NoteSummary } from "./domain/note.ts";
export { NotesError, type NotesErrorCode } from "./domain/errors.ts";
