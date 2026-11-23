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

/** Um resultado da busca global. */
export interface SearchHit {
  readonly id: string;
  readonly title: string;
  readonly icon: string | null;
  readonly isDatabase: boolean;
  /** Trecho do texto da página em volta do que foi encontrado (pode ser vazio). */
  readonly snippet: string;
  /** `true` se o título bate com a busca (senão, só o texto bateu). */
  readonly inTitle: boolean;
}

/** Um modelo de página embutido no aplicativo. */
export interface TemplateInfo {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
  /** `true` para os modelos criados pela pessoa (que podem ser apagados). */
  readonly custom: boolean;
}

/** Uma página citada numa lista de ligações. */
export interface PageRef {
  readonly id: string;
  readonly title: string;
  readonly icon: string | null;
  readonly isDatabase: boolean;
}

/** Uma ligação do grafo: `link` = menção ou subpágina escrita no texto; `child` = hierarquia. */
export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: "link" | "child";
}

export interface PageGraph {
  readonly nodes: readonly PageRef[];
  readonly edges: readonly GraphEdge[];
}

/** Uma versão antiga de uma página, na lista do histórico. */
export interface VersionSummary {
  readonly id: string;
  readonly title: string;
  /** Começo do texto, em uma linha. */
  readonly preview: string;
  /** Quando esse estado foi salvo pela última vez (ms). */
  readonly savedAt: number;
}

/** Uma versão inteira (texto simples), para ver antes de restaurar. */
export interface VersionDetail {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly savedAt: number;
}
