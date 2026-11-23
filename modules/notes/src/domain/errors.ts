/** Códigos de erro estáveis do módulo (definidos no Rust). A interface os traduz em mensagens. */
export type NotesErrorCode =
  | "notes.title-empty"
  | "notes.title-too-long"
  | "notes.url-invalid"
  | "notes.icon-invalid"
  | "notes.cover-invalid"
  | "notes.not-database"
  | "notes.property-not-found"
  | "notes.property-invalid"
  | "notes.cell-invalid"
  | "notes.template-invalid"
  | "notes.view-not-found"
  | "notes.view-invalid"
  | "notes.limit-reached"
  | "notes.asset-too-large"
  | "notes.asset-type-not-allowed"
  | "notes.asset-invalid"
  | "notes.content-invalid"
  | "notes.content-too-large"
  | "notes.not-found"
  | "notes.in-trash"
  | "notes.not-in-trash"
  | "notes.parent-not-found"
  | "notes.parent-in-trash"
  | "notes.cycle"
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
