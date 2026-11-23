import { describe, expect, it } from "vitest";
import type { CellValue, DatabaseRow, Property } from "../domain/database.ts";
import {
  TITLE_KEY,
  aggregate,
  displayValue,
  filterRows,
  groupRows,
  operatorsFor,
  sortRows,
  type FilterRule,
} from "./database-query.ts";

const prop = (id: string, type: Property["type"], options: Property["options"] = []): Property => ({
  id,
  databaseId: "db",
  name: id,
  type,
  options,
  position: 0,
});
const row = (id: string, title: string, cells: DatabaseRow["cells"] = {}): DatabaseRow => ({
  id,
  title,
  icon: null,
  updatedAt: 1,
  cells,
});

const STATUS = prop("status", "select", [
  { id: "a", name: "A fazer", color: "gray" },
  { id: "b", name: "Feito", color: "green" },
]);
const TAGS = prop("tags", "multi_select", [
  { id: "x", name: "Urgente", color: "red" },
  { id: "y", name: "Casa", color: "blue" },
]);
const PROPS = [
  prop("obs", "text"),
  prop("qtd", "number"),
  prop("ok", "checkbox"),
  prop("prazo", "date"),
  STATUS,
  TAGS,
];

const ROWS = [
  row("1", "Comprar pão", {
    obs: "Padaria da esquina",
    qtd: 2,
    ok: true,
    prazo: "2024-03-10",
    status: "a",
    tags: ["x", "y"],
  }),
  row("2", "Ação judicial", {
    obs: "",
    qtd: 10,
    ok: false,
    prazo: "2024-01-05",
    status: "b",
    tags: ["y"],
  }),
  row("3", "Sem nada"),
];
const ids = (rows: readonly DatabaseRow[]) => rows.map((r) => r.id);
const rule = (property: string, operator: FilterRule["operator"], value = ""): FilterRule => ({
  property,
  operator,
  value,
});
const run = (...rules: FilterRule[]) => ids(filterRows(ROWS, PROPS, rules));

describe("operatorsFor", () => {
  it("oferece operadores coerentes com o tipo", () => {
    expect(operatorsFor("checkbox")).toEqual(["checked", "unchecked"]);
    expect(operatorsFor("number")).toContain("gt");
    expect(operatorsFor("date")).toContain("before");
    expect(operatorsFor("text")).not.toContain("gt");
    expect(operatorsFor("title")).toContain("contains");
    expect(operatorsFor("select")).toContain("is");
    expect(operatorsFor("multi_select")).toContain("contains");
    expect(operatorsFor("url")).toContain("equals");
  });
});

describe("filterRows", () => {
  it("sem regras devolve tudo", () => {
    expect(run()).toEqual(["1", "2", "3"]);
  });

  it("título contém, sem diferenciar acento nem maiúscula", () => {
    expect(run(rule(TITLE_KEY, "contains", "acao"))).toEqual(["2"]);
    expect(run(rule(TITLE_KEY, "contains", "PAO"))).toEqual(["1"]);
  });

  it("texto: contém, igual, vazio e não vazio (texto vazio conta como vazio)", () => {
    expect(run(rule("obs", "contains", "padaria"))).toEqual(["1"]);
    expect(run(rule("obs", "equals", "padaria da esquina"))).toEqual(["1"]);
    expect(run(rule("obs", "empty"))).toEqual(["2", "3"]);
    expect(run(rule("obs", "not-empty"))).toEqual(["1"]);
  });

  it("número: igual, maior e menor; vazio nunca satisfaz comparação", () => {
    expect(run(rule("qtd", "equals", "10"))).toEqual(["2"]);
    expect(run(rule("qtd", "gt", "2"))).toEqual(["2"]);
    expect(run(rule("qtd", "lt", "10"))).toEqual(["1"]);
    expect(run(rule("qtd", "gt", "0"))).toEqual(["1", "2"]);
    expect(run(rule("qtd", "empty"))).toEqual(["3"]);
  });

  it("caixa: marcado e desmarcado (sem célula = desmarcado)", () => {
    expect(run(rule("ok", "checked"))).toEqual(["1"]);
    expect(run(rule("ok", "unchecked"))).toEqual(["2", "3"]);
    expect(run(rule("ok", "empty"))).toEqual(["2", "3"]);
  });

  it("data: antes, em e depois", () => {
    expect(run(rule("prazo", "before", "2024-02-01"))).toEqual(["2"]);
    expect(run(rule("prazo", "on", "2024-03-10"))).toEqual(["1"]);
    expect(run(rule("prazo", "after", "2024-02-01"))).toEqual(["1"]);
  });

  it("data com hora: filtros, ordenação e exibição olham o dia", () => {
    const rows = [
      row("1", "A", { prazo: "2024-03-10T18:00" }),
      row("2", "B", { prazo: "2024-03-10" }),
      row("3", "C", { prazo: "2024-03-09T23:59" }),
      row("4", "D", { prazo: "2024-03-10T08:00" }),
    ];
    const ids = (list: readonly DatabaseRow[]) => list.map((r) => r.id);
    const f = (operator: FilterRule["operator"], value: string) =>
      ids(filterRows(rows, PROPS, [{ property: "prazo", operator, value }]));
    expect(f("on", "2024-03-10")).toEqual(["1", "2", "4"]);
    expect(f("before", "2024-03-10")).toEqual(["3"]);
    expect(f("after", "2024-03-09")).toEqual(["1", "2", "4"]);
    expect(ids(sortRows(rows, PROPS, { property: "prazo", direction: "asc" }))).toEqual([
      "3",
      "2",
      "4",
      "1",
    ]);
    expect(displayValue(prop("prazo", "date"), "2024-03-10T18:00")).toBe("2024-03-10 18:00");
    expect(displayValue(prop("prazo", "date"), "2024-03-10")).toBe("2024-03-10");
  });

  it("seleção: é, não é (linha sem valor não 'é' nada, mas 'não é' vale com valor presente)", () => {
    expect(run(rule("status", "is", "a"))).toEqual(["1"]);
    expect(run(rule("status", "is-not", "a"))).toEqual(["2"]);
    expect(run(rule("status", "empty"))).toEqual(["3"]);
  });

  it("seleção múltipla: contém pelo id ou pelo nome da opção", () => {
    expect(run(rule("tags", "contains", "x"))).toEqual(["1"]);
    expect(run(rule("tags", "contains", "casa"))).toEqual(["1", "2"]);
    expect(run(rule("tags", "not-empty"))).toEqual(["1", "2"]);
  });

  it("várias regras são combinadas com E", () => {
    expect(run(rule("tags", "contains", "casa"), rule("ok", "checked"))).toEqual(["1"]);
    expect(run(rule("tags", "contains", "casa"), rule("qtd", "gt", "100"))).toEqual([]);
  });

  it("regra sem valor digitado ainda não restringe", () => {
    expect(run(rule("obs", "contains", ""))).toEqual(["1", "2", "3"]);
    expect(run(rule("status", "is", "  "))).toEqual(["1", "2", "3"]);
  });

  it("ignora regras de colunas que não existem mais", () => {
    expect(run(rule("apagada", "contains", "x"))).toEqual(["1", "2", "3"]);
  });
});

describe("sortRows", () => {
  it("sem regra mantém a ordem", () => {
    expect(ids(sortRows(ROWS, PROPS, null))).toEqual(["1", "2", "3"]);
  });

  it("título, sem diferenciar acento (Ação vem antes de Comprar)", () => {
    expect(ids(sortRows(ROWS, PROPS, { property: TITLE_KEY, direction: "asc" }))).toEqual([
      "2",
      "1",
      "3",
    ]);
    expect(ids(sortRows(ROWS, PROPS, { property: TITLE_KEY, direction: "desc" }))).toEqual([
      "3",
      "1",
      "2",
    ]);
  });

  it("número crescente e decrescente, vazios SEMPRE no fim", () => {
    expect(ids(sortRows(ROWS, PROPS, { property: "qtd", direction: "asc" }))).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(ids(sortRows(ROWS, PROPS, { property: "qtd", direction: "desc" }))).toEqual([
      "2",
      "1",
      "3",
    ]);
  });

  it("data, e seleção pelo NOME da opção (não pelo id)", () => {
    expect(ids(sortRows(ROWS, PROPS, { property: "prazo", direction: "asc" }))).toEqual([
      "2",
      "1",
      "3",
    ]);
    // "A fazer" < "Feito" pelo nome; pelo id seria igual ordem, então inverto os ids para provar
    const flipped = prop("status", "select", [
      { id: "a", name: "Zebra", color: "gray" },
      { id: "b", name: "Abelha", color: "green" },
    ]);
    expect(ids(sortRows(ROWS, [flipped], { property: "status", direction: "asc" }))).toEqual([
      "2",
      "1",
      "3",
    ]);
  });

  it("empates mantêm a ordem original (estável), nas duas direções", () => {
    const rows = [row("a", "X", { qtd: 1 }), row("b", "Y", { qtd: 1 }), row("c", "Z", { qtd: 1 })];
    expect(ids(sortRows(rows, PROPS, { property: "qtd", direction: "asc" }))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(ids(sortRows(rows, PROPS, { property: "qtd", direction: "desc" }))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("coluna que não existe mais não reordena", () => {
    expect(ids(sortRows(ROWS, PROPS, { property: "apagada", direction: "asc" }))).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("caixa: desmarcado antes de marcado", () => {
    expect(ids(sortRows(ROWS, PROPS, { property: "ok", direction: "asc" }))).toEqual([
      "2",
      "1",
      "3",
    ]);
  });
});

describe("displayValue", () => {
  it("mostra cada tipo de forma legível", () => {
    expect(displayValue(STATUS, "b")).toBe("Feito");
    expect(displayValue(TAGS, ["x", "y"])).toBe("Urgente, Casa");
    expect(displayValue(prop("ok", "checkbox"), true)).toBe("Sim");
    expect(displayValue(prop("ok", "checkbox"), false)).toBe("Não");
    expect(displayValue(prop("qtd", "number"), 3)).toBe("3");
    expect(displayValue(prop("obs", "text"), undefined)).toBe("");
    expect(displayValue(STATUS, "removida")).toBe("removida");
  });
});

describe("groupRows", () => {
  it("uma coluna por opção, na ordem das opções, e 'sem valor' por último", () => {
    const columns = groupRows(ROWS, STATUS);

    expect(columns.map((c) => c.option?.id ?? null)).toEqual(["a", "b", null]);
    expect(columns.map((c) => ids(c.rows))).toEqual([["1"], ["2"], ["3"]]);
  });

  it("mantém a ordem das linhas dentro do grupo e sempre devolve 'sem valor', mesmo vazio", () => {
    const rows = [row("x", "X", { status: "a" }), row("y", "Y", { status: "a" })];

    const columns = groupRows(rows, STATUS);

    expect(ids(columns[0]!.rows)).toEqual(["x", "y"]);
    expect(columns[2]!.option).toBeNull();
    expect(columns[2]!.rows).toEqual([]);
  });

  it("valor de opção que não existe mais cai em 'sem valor'", () => {
    const rows = [row("z", "Z", { status: "removida" })];

    expect(ids(groupRows(rows, STATUS)[2]!.rows)).toEqual(["z"]);
  });

  it("base sem opções tem só a coluna 'sem valor'", () => {
    const columns = groupRows(ROWS, prop("vazia", "select"));

    expect(columns).toHaveLength(1);
    expect(ids(columns[0]!.rows)).toEqual(["1", "2", "3"]);
  });
});

describe("aggregate (gráfico)", () => {
  const rowsOf = (cells: Array<Record<string, CellValue>>) =>
    cells.map((c, i) => row(`r${i}`, `R${i}`, c));
  const bars = (list: ReturnType<typeof aggregate>) => list.map((b) => [b.label, b.value, b.count]);

  it("seleção: uma barra por opção, na ordem, mesmo vazia, e 'Sem valor' por último só se houver", () => {
    const rows = rowsOf([{ status: "b" }, { status: "b" }, { status: "a" }, {}]);

    expect(bars(aggregate(rows, STATUS, null))).toEqual([
      ["A fazer", 1, 1],
      ["Feito", 2, 2],
      ["Sem valor", 1, 1],
    ]);
    expect(bars(aggregate(rowsOf([{ status: "a" }]), STATUS, null))).toEqual([
      ["A fazer", 1, 1],
      ["Feito", 0, 0],
    ]);
  });

  it("valor de opção removida cai em 'Sem valor'; cores das opções acompanham as barras", () => {
    const list = aggregate(rowsOf([{ status: "removida" }, { status: "a" }]), STATUS, null);

    expect(list.map((b) => b.label)).toEqual(["A fazer", "Feito", "Sem valor"]);
    expect(list[0]!.color).toBe("gray");
    expect(list[2]!.color).toBeNull();
  });

  it("seleção múltipla: a linha conta em cada opção dela", () => {
    const rows = rowsOf([{ tags: ["x", "y"] }, { tags: ["y"] }, {}]);

    expect(bars(aggregate(rows, TAGS, null))).toEqual([
      ["Urgente", 1, 1],
      ["Casa", 2, 2],
      ["Sem valor", 1, 1],
    ]);
  });

  it("caixa: Marcado e Desmarcado (sem célula = desmarcado)", () => {
    const rows = rowsOf([{ ok: true }, { ok: false }, {}]);

    expect(bars(aggregate(rows, prop("ok", "checkbox"), null))).toEqual([
      ["Marcado", 1, 1],
      ["Desmarcado", 2, 2],
    ]);
  });

  it("data: uma barra por mês em ordem cronológica (atravessando o ano), 'Sem data' no fim", () => {
    const rows = rowsOf([
      { d: "2026-12-05" },
      { d: "2026-01-10" },
      { d: "2025-12-31" },
      { d: "2026-01-02T09:30" },
      {},
      { d: "texto" },
    ]);

    expect(bars(aggregate(rows, prop("d", "date"), null))).toEqual([
      ["dezembro de 2025", 1, 1],
      ["janeiro de 2026", 2, 2],
      ["dezembro de 2026", 1, 1],
      ["Sem valor", 2, 2],
    ]);
  });

  it("soma uma coluna de número em vez de contar (células vazias valem 0), e a contagem segue disponível", () => {
    const rows = rowsOf([
      { status: "a", qtd: 10 },
      { status: "a", qtd: 5.5 },
      { status: "b" },
      { status: "b", qtd: "x" as never },
    ]);

    const list = aggregate(rows, STATUS, prop("qtd", "number"));

    expect(bars(list)).toEqual([
      ["A fazer", 15.5, 2],
      ["Feito", 0, 2],
    ]);
  });

  it("colunas que não dão categoria (texto, número, link) devolvem lista vazia; sem linhas, barras zeradas", () => {
    expect(aggregate(ROWS, prop("obs", "text"), null)).toEqual([]);
    expect(aggregate(ROWS, prop("qtd", "number"), null)).toEqual([]);
    expect(aggregate([], STATUS, null).map((b) => b.value)).toEqual([0, 0]);
    expect(aggregate([], prop("d", "date"), null)).toEqual([]);
  });
});
