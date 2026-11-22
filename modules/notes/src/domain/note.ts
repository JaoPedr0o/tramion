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

export interface NewNote {
  readonly title: string;
  readonly body: string;
}

export interface UpdateNote {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /** O `updatedAt` que quem edita viu ao abrir a nota. Se a nota já mudou, a edição é recusada. */
  readonly expectedUpdatedAt: number;
}
