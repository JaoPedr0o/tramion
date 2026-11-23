import type { CellValue, DatabaseRow, Property, PropertyType } from "../domain/database.ts";

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
