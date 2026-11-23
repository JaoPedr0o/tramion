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

/** Tudo o que a tela da base precisa. */
export interface DatabaseData {
  readonly id: string;
  readonly title: string;
  readonly properties: readonly Property[];
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
