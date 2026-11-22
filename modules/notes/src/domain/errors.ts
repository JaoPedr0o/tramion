/** Códigos de erro estáveis do módulo (definidos no Rust). A interface os traduz em mensagens. */
export type NotesErrorCode =
  | "notes.title-empty"
  | "notes.title-too-long"
  | "notes.not-found"
  | "notes.in-trash"
  | "notes.not-in-trash"
  | "notes.conflict"
  | "notes.internal";

/** Formato do erro que o Rust devolve. */
export interface NotesErrorPayload {
  readonly code: string;
  readonly message: string;
}

/** Erro conhecido do módulo de notas. A interface decide a mensagem a partir do `code`. */
export class NotesError extends Error {
  readonly code: NotesErrorCode;

  constructor(code: NotesErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NotesError";
    this.code = code;
  }
}
