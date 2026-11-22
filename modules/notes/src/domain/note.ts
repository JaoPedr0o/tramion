/** Resumo de uma nota, como aparece nas listagens (o corpo só é carregado ao abrir a nota). */
export interface NoteSummary {
  readonly id: string;
  readonly title: string;
  readonly pinned: boolean;
  /** Milissegundos desde 1970 (UTC). */
  readonly updatedAt: number;
  /** `null` = ativa; número = instante em que foi para a lixeira. */
  readonly deletedAt: number | null;
}

/** Nota completa. */
export interface Note extends NoteSummary {
  readonly body: string;
  readonly createdAt: number;
}

/** Erro devolvido pelo Rust: um código estável e um texto técnico. */
export interface NotesErrorPayload {
  readonly code: string;
  readonly message: string;
}

/** Códigos de erro estáveis do módulo (definidos no Rust). A interface os traduz em mensagens. */
export type NotesErrorCode =
  | "notes.title-empty"
  | "notes.title-too-long"
  | "notes.not-found"
  | "notes.in-trash"
  | "notes.not-in-trash"
  | "notes.conflict"
  | "notes.internal";
