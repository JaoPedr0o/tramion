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
  /** Símbolo da página (um emoji); `null` = sem símbolo. */
  readonly icon: string | null;
  /** A página é uma base de dados (as subpáginas são as linhas). */
  readonly isDatabase: boolean;
}

/** Nota completa. (O Rust só informa `isDatabase` nas listagens; abrir uma base usa `getDatabase`.) */
export interface Note extends Omit<NoteSummary, "isDatabase"> {
  /** Texto simples da página (espelho do conteúdo, para a busca). */
  readonly body: string;
  /** Os blocos da página, em JSON (uma lista). `[]` = vazia ou ainda não convertida. */
  readonly content: string;
  /** Capa: `color:#rrggbb`, `gradient:<nome>` ou `image:<endereço>`; `null` = sem capa. */
  readonly cover: string | null;
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

/** Símbolo e capa de uma página. `null` limpa. Os dois são enviados juntos. */
export interface SetAppearance {
  readonly id: string;
  readonly icon: string | null;
  readonly cover: string | null;
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
