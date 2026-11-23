/** Resumo de uma nota, como aparece nas listagens (o corpo só é carregado ao abrir a nota). */
export interface NoteSummary {
  readonly id: string;
  readonly title: string;
  readonly pinned: boolean;
  /** Milissegundos desde 1970 (UTC). */
  readonly updatedAt: number;
  /** `null` = ativa; número = instante em que foi para a lixeira. */
  readonly deletedAt: number | null;
  /** Página-mãe; `null` = está na raiz. */
  readonly parentId: string | null;
  /** Posição entre as irmãs, a partir de 0. */
  readonly position: number;
}

/** Nota completa. */
export interface Note extends NoteSummary {
  /** Texto simples da página (espelho do conteúdo, para a busca). */
  readonly body: string;
  /** Os blocos da página, em JSON (uma lista). `[]` = vazia ou ainda não convertida. */
  readonly content: string;
  readonly createdAt: number;
}

/** Item da lixeira: só as raízes de cada exclusão; as subpáginas excluídas junto entram na contagem. */
export interface TrashSummary {
  readonly id: string;
  readonly title: string;
  readonly deletedAt: number;
  readonly descendantCount: number;
}

export interface NewNote {
  readonly title: string;
  readonly body: string;
  /** Página-mãe; ausente ou `null` cria na raiz. */
  readonly parentId?: string | null;
}

export interface MoveNote {
  readonly id: string;
  /** `null` move para a raiz. */
  readonly newParentId: string | null;
  /** Posição desejada entre as irmãs do destino; além do fim vira "no fim". */
  readonly index: number;
}

export interface UpdateNote {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly content: string;
  /** O `updatedAt` que quem edita viu ao abrir a nota. Se a nota já mudou, a edição é recusada. */
  readonly expectedUpdatedAt: number;
}
