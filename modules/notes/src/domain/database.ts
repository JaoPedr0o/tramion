/** Tipos de coluna de uma base de dados. */
export type PropertyType =
  "text" | "number" | "select" | "multi_select" | "date" | "checkbox" | "url";

export const PROPERTY_TYPES: readonly PropertyType[] = [
  "text",
  "number",
  "select",
  "multi_select",
  "date",
  "checkbox",
  "url",
];

export const PROPERTY_TYPE_LABELS: Readonly<Record<PropertyType, string>> = {
  text: "Texto",
  number: "Número",
  select: "Seleção",
  multi_select: "Seleção múltipla",
  date: "Data",
  checkbox: "Caixa de seleção",
  url: "Link",
};

/** Uma opção de coluna de seleção. A célula guarda o `id`; o nome e a cor podem mudar sem perder dados. */
export interface SelectOption {
  readonly id: string;
  readonly name: string;
  /** Nome da cor (`default`, `gray`, `blue`...). */
  readonly color: string;
}

/** Uma coluna. O título da linha não é coluna: é o título da própria página. */
export interface Property {
  readonly id: string;
  readonly databaseId: string;
  readonly name: string;
  readonly type: PropertyType;
  /** Só para `select` e `multi_select`. */
  readonly options: readonly SelectOption[];
  readonly position: number;
}

/**
 * Valor de uma célula, conforme o tipo: texto/link/data (`AAAA-MM-DD`) e seleção = texto (seleção: o id da
 * opção); número = número; caixa = verdadeiro/falso; seleção múltipla = lista de ids. Célula vazia não existe.
 */
export type CellValue = string | number | boolean | readonly string[];

export interface DatabaseRow {
  readonly id: string;
  readonly title: string;
  readonly icon: string | null;
  readonly updatedAt: number;
  /** Valores das células preenchidas, por id de coluna. */
  readonly cells: Readonly<Record<string, CellValue>>;
}

/** Formas de exibição de uma visão. */
export type ViewMode = "table" | "board" | "list" | "gallery" | "calendar";

export const VIEW_MODES: ReadonlyArray<readonly [ViewMode, string]> = [
  ["table", "Tabela"],
  ["board", "Quadro"],
  ["list", "Lista"],
  ["gallery", "Galeria"],
  ["calendar", "Calendário"],
];

/** Uma regra de filtro (os mesmos campos de `FilterRule`, da camada de aplicação). */
export interface ViewFilter {
  readonly property: string;
  readonly operator: string;
  readonly value: string;
}

/** O que uma visão guarda: forma de exibição, filtros, ordenação e as colunas de agrupamento e de data. */
export interface ViewConfig {
  readonly mode: ViewMode;
  readonly filters: readonly ViewFilter[];
  readonly sort: { readonly property: string; readonly direction: "asc" | "desc" } | null;
  /** Coluna de seleção do quadro; `null` = a primeira. */
  readonly groupBy?: string | null;
  /** Coluna de data do calendário; `null` = a primeira. */
  readonly dateProperty?: string | null;
  /** Escala do calendário; `null` = mês. */
  readonly scale?: "month" | "week" | null;
}

/** Uma visão salva de uma base: toda base tem pelo menos uma. */
export interface View {
  readonly id: string;
  readonly databaseId: string;
  readonly name: string;
  readonly config: ViewConfig;
  readonly position: number;
}

/** Tudo o que a tela da base precisa. */
export interface DatabaseData {
  readonly id: string;
  readonly title: string;
  readonly properties: readonly Property[];
  readonly views: readonly View[];
  readonly rows: readonly DatabaseRow[];
}

export interface NewProperty {
  readonly databaseId: string;
  readonly name: string;
  readonly type: PropertyType;
}

/** Mudança numa coluna: o que estiver ausente fica como está. O tipo não muda. */
export interface PropertyChange {
  readonly id: string;
  readonly name?: string;
  readonly options?: readonly SelectOption[];
}

export interface SetCell {
  readonly noteId: string;
  readonly propertyId: string;
  /** `null` esvazia a célula. */
  readonly value: CellValue | null;
}
