import { MONTH_NAMES } from "./calendar.ts";
import type {
  CellValue,
  DatabaseRow,
  Property,
  PropertyType,
  SelectOption,
} from "../domain/database.ts";

/** Id especial: o título da linha (que não é uma coluna). */
export const TITLE_KEY = "title";

export type Operator =
  | "contains"
  | "equals"
  | "gt"
  | "lt"
  | "before"
  | "on"
  | "after"
  | "is"
  | "is-not"
  | "checked"
  | "unchecked"
  | "empty"
  | "not-empty";

export const OPERATOR_LABELS: Readonly<Record<Operator, string>> = {
  contains: "contém",
  equals: "é igual a",
  gt: "maior que",
  lt: "menor que",
  before: "antes de",
  on: "em",
  after: "depois de",
  is: "é",
  "is-not": "não é",
  checked: "marcado",
  unchecked: "desmarcado",
  empty: "está vazio",
  "not-empty": "não está vazio",
};

/** Operadores que não precisam de valor. */
export const VALUELESS_OPERATORS: ReadonlySet<Operator> = new Set([
  "checked",
  "unchecked",
  "empty",
  "not-empty",
]);

/** Operadores disponíveis para cada tipo de coluna (`title` = o título da linha). */
export function operatorsFor(type: PropertyType | "title"): readonly Operator[] {
  switch (type) {
    case "title":
    case "text":
    case "url":
      return ["contains", "equals", "empty", "not-empty"];
    case "number":
      return ["equals", "gt", "lt", "empty", "not-empty"];
    case "date":
      return ["on", "before", "after", "empty", "not-empty"];
    case "checkbox":
      return ["checked", "unchecked"];
    case "select":
      return ["is", "is-not", "empty", "not-empty"];
    case "multi_select":
      return ["contains", "empty", "not-empty"];
  }
}

export interface FilterRule {
  /** Id da coluna ou `TITLE_KEY`. */
  readonly property: string;
  readonly operator: Operator;
  /** Texto digitado, número em texto, data `AAAA-MM-DD` ou id de opção. Ignorado nos operadores sem valor. */
  readonly value: string;
}

export interface SortRule {
  readonly property: string;
  readonly direction: "asc" | "desc";
}

/** Sem acento e sem diferença de maiúsculas ("Ação" encontra "acao"). */
const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** O valor "cru" de uma linha para uma coluna: o título, a célula, ou `undefined` se vazia. */
function valueOf(row: DatabaseRow, key: string): CellValue | undefined {
  return key === TITLE_KEY ? row.title : row.cells[key];
}

const isEmpty = (value: CellValue | undefined) =>
  value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

function matches(
  row: DatabaseRow,
  rule: FilterRule,
  type: PropertyType | "title",
  optionName: (propertyId: string, optionId: string) => string,
): boolean {
  const value = valueOf(row, rule.property);
  switch (rule.operator) {
    case "empty":
      return type === "checkbox" ? value !== true : isEmpty(value);
    case "not-empty":
      return !isEmpty(value);
    case "checked":
      return value === true;
    case "unchecked":
      return value !== true;
  }
  // Os demais operadores comparam com um valor; sem valor digitado, o filtro ainda não restringe nada.
  if (rule.value.trim() === "") return true;
  if (isEmpty(value)) return false;

  switch (rule.operator) {
    case "contains": {
      const needle = plain(rule.value.trim());
      if (Array.isArray(value)) {
        return value.some(
          (id) => id === rule.value || plain(optionName(rule.property, id)).includes(needle),
        );
      }
      return plain(String(value)).includes(needle);
    }
    case "equals":
      if (type === "number") return Number(value) === Number(rule.value);
      return plain(String(value)) === plain(rule.value.trim());
    case "gt":
      return Number(value) > Number(rule.value);
    case "lt":
      return Number(value) < Number(rule.value);
    // Datas no formato AAAA-MM-DD comparam corretamente como texto.
    case "before":
      return String(value) < rule.value;
    case "on":
      return String(value) === rule.value;
    case "after":
      return String(value) > rule.value;
    case "is":
      return value === rule.value;
    case "is-not":
      return value !== rule.value;
    default:
      return true;
  }
}

/** Só as linhas que passam em TODAS as regras. Regra de coluna que não existe mais é ignorada. */
export function filterRows(
  rows: readonly DatabaseRow[],
  properties: readonly Property[],
  rules: readonly FilterRule[],
): readonly DatabaseRow[] {
  const byId = new Map(properties.map((p) => [p.id, p]));
  const optionName = (propertyId: string, optionId: string) =>
    byId.get(propertyId)?.options.find((o) => o.id === optionId)?.name ?? optionId;
  const usable = rules.filter((rule) => rule.property === TITLE_KEY || byId.has(rule.property));
  return rows.filter((row) =>
    usable.every((rule) =>
      matches(
        row,
        rule,
        rule.property === TITLE_KEY ? "title" : byId.get(rule.property)!.type,
        optionName,
      ),
    ),
  );
}

/** Ordena por uma coluna. Vazios ficam sempre no fim; empate mantém a ordem original (ordenação estável). */
export function sortRows(
  rows: readonly DatabaseRow[],
  properties: readonly Property[],
  sort: SortRule | null,
): readonly DatabaseRow[] {
  if (!sort) return rows;
  const property =
    sort.property === TITLE_KEY ? null : properties.find((p) => p.id === sort.property);
  if (sort.property !== TITLE_KEY && !property) return rows;
  const sign = sort.direction === "asc" ? 1 : -1;
  const nameOf = (id: string) => property?.options.find((o) => o.id === id)?.name ?? id;

  const key = (row: DatabaseRow): string | number | boolean | undefined => {
    const value = valueOf(row, sort.property);
    if (isEmpty(value)) return undefined;
    if (property?.type === "select") return plain(nameOf(value as string));
    if (property?.type === "multi_select")
      return plain((value as readonly string[]).map(nameOf).join(" "));
    if (typeof value === "string") return plain(value);
    return value as number | boolean;
  };

  return rows
    .map((row, index) => ({ row, index, k: key(row) }))
    .sort((a, b) => {
      if (a.k === undefined || b.k === undefined) {
        if (a.k === b.k) return a.index - b.index;
        return a.k === undefined ? 1 : -1; // vazio sempre depois, nas duas direções
      }
      const compared = a.k < b.k ? -1 : a.k > b.k ? 1 : 0;
      return compared * sign || a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** Texto para mostrar uma célula fora do editor (por exemplo, no resumo). */
export function displayValue(property: Property, value: CellValue | undefined): string {
  if (isEmpty(value)) return "";
  if (property.type === "checkbox") return value === true ? "Sim" : "Não";
  const nameOf = (id: string) => property.options.find((o) => o.id === id)?.name ?? id;
  if (property.type === "select") return nameOf(value as string);
  if (property.type === "multi_select") return (value as readonly string[]).map(nameOf).join(", ");
  return String(value);
}

/** Uma coluna do quadro: as linhas de uma opção (ou as sem valor, quando `option` é `null`). */
export interface BoardColumn {
  readonly option: SelectOption | null;
  readonly rows: readonly DatabaseRow[];
}

/**
 * Agrupa as linhas pelas opções de uma coluna de SELEÇÃO. Há uma coluna do quadro por opção, na ordem
 * das opções, e "sem valor" por último (sempre presente). Mantém a ordem das linhas dentro de cada grupo.
 * Valor que aponta para uma opção que não existe mais cai em "sem valor".
 */
export function groupRows(
  rows: readonly DatabaseRow[],
  property: Property,
): readonly BoardColumn[] {
  const known = new Set(property.options.map((option) => option.id));
  const groups = new Map<string | null, DatabaseRow[]>(property.options.map((o) => [o.id, []]));
  groups.set(null, []);
  for (const row of rows) {
    const value = row.cells[property.id];
    const key = typeof value === "string" && known.has(value) ? value : null;
    groups.get(key)!.push(row);
  }
  return [
    ...property.options.map((option) => ({ option, rows: groups.get(option.id)! })),
    { option: null, rows: groups.get(null)! },
  ];
}

/** Uma barra do gráfico. */
export interface ChartBar {
  readonly key: string;
  readonly label: string;
  /** Cor da opção (para seleções); `null` nas demais. */
  readonly color: string | null;
  /** O que a barra mede: a contagem de linhas ou a soma da coluna de número. */
  readonly value: number;
  /** Quantas linhas caíram na barra. */
  readonly count: number;
}

/** Tipos de coluna que dão categorias para o gráfico. */
export const CHART_CATEGORY_TYPES: readonly PropertyType[] = [
  "select",
  "multi_select",
  "checkbox",
  "date",
];

/**
 * Agrupa as linhas pelas categorias de uma coluna e mede cada grupo: contando as linhas ou somando uma coluna de número.
 * Seleção: uma barra por opção (na ordem, mesmo vazia). Seleção múltipla: a linha conta em cada opção dela. Caixa:
 * "Marcado" e "Desmarcado". Data: uma barra por mês, em ordem. Linhas sem valor vão numa barra "Sem valor" (só se houver).
 */
export function aggregate(
  rows: readonly DatabaseRow[],
  property: Property,
  valueProperty: Property | null,
): ChartBar[] {
  if (!CHART_CATEGORY_TYPES.includes(property.type)) return [];
  const measure = (row: DatabaseRow): number => {
    if (!valueProperty) return 1;
    const value = row.cells[valueProperty.id];
    return typeof value === "number" ? value : 0;
  };

  const bars = new Map<
    string,
    { label: string; color: string | null; value: number; count: number }
  >();
  const add = (key: string, label: string, color: string | null, row: DatabaseRow) => {
    const bar = bars.get(key) ?? { label, color, value: 0, count: 0 };
    bar.value += measure(row);
    bar.count += 1;
    bars.set(key, bar);
  };
  const seed = (key: string, label: string, color: string | null) =>
    bars.set(key, { label, color, value: 0, count: 0 });

  if (property.type === "select" || property.type === "multi_select") {
    for (const option of property.options) seed(option.id, option.name, option.color);
  } else if (property.type === "checkbox") {
    seed("on", "Marcado", null);
    seed("off", "Desmarcado", null);
  }

  for (const row of rows) {
    const value = row.cells[property.id];
    if (property.type === "select") {
      const option = property.options.find((o) => o.id === value);
      if (option) add(option.id, option.name, option.color, row);
      else add("none", "Sem valor", null, row);
    } else if (property.type === "multi_select") {
      const chosen = Array.isArray(value)
        ? property.options.filter((o) => value.includes(o.id))
        : [];
      if (chosen.length === 0) add("none", "Sem valor", null, row);
      for (const option of chosen) add(option.id, option.name, option.color, row);
    } else if (property.type === "checkbox") {
      add(value === true ? "on" : "off", value === true ? "Marcado" : "Desmarcado", null, row);
    } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const month = value.slice(0, 7);
      const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1]!;
      add(month, `${name} de ${month.slice(0, 4)}`, null, row);
    } else {
      add("none", "Sem valor", null, row);
    }
  }

  const ordered = [...bars.entries()].filter(([key, bar]) => key !== "none" || bar.count > 0);
  if (property.type === "date")
    ordered.sort(([a], [b]) => (a === "none" ? 1 : b === "none" ? -1 : a.localeCompare(b)));
  else ordered.sort(([a], [b]) => Number(a === "none") - Number(b === "none")); // "Sem valor" sempre por último
  return ordered.map(([key, bar]) => ({ key, ...bar }));
}
