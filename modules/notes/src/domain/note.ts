/** Resumo de uma nota, como aparece nas listagens (o corpo só é carregado ao abrir a nota). */
export interface NoteSummary {
  readonly id: string;
  readonly title: string;
  readonly pinned: boolean;
  /** Milissegundos desde 1970 (UTC). */
  readonly updatedAt: number;
}

/** Erro devolvido pelo Rust: um código estável e um texto técnico. */
export interface NotesErrorPayload {
  readonly code: string;
  readonly message: string;
}
