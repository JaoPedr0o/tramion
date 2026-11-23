import { describe, expect, it } from "vitest";
import { planExport } from "./export-plan.ts";
import { aSummary } from "../test-support.ts";

const page = (id: string, title: string, parentId: string | null = null) =>
  aSummary({ id, title, parentId });
const paths = (pages: ReturnType<typeof page>[]) => planExport(pages).map((e) => e.path.join("/"));

describe("planExport", () => {
  it("espelha a hierarquia: filhas ficam na pasta do pai, em qualquer nível", () => {
    expect(
      paths([
        page("a", "Pai"),
        page("b", "Filha", "a"),
        page("c", "Neta", "b"),
        page("d", "Outra"),
      ]),
    ).toEqual(["Pai", "Pai/Filha", "Pai/Filha/Neta", "Outra"]);
  });

  it("nomes iguais entre irmãs ganham número, sem diferenciar maiúsculas; em pastas diferentes não colide", () => {
    expect(
      paths([
        page("a", "Nota"),
        page("b", "nota"),
        page("c", "NOTA"),
        page("d", "Pai"),
        page("e", "Nota", "d"),
      ]),
    ).toEqual(["Nota", "nota (2)", "NOTA (3)", "Pai", "Pai/Nota"]);
  });

  it("filhas de páginas com o mesmo nome vão para pastas diferentes", () => {
    expect(
      paths([page("a", "Pai"), page("b", "Pai"), page("c", "Filha", "a"), page("d", "Filha", "b")]),
    ).toEqual(["Pai", "Pai/Filha", "Pai (2)", "Pai (2)/Filha"]);
  });

  it("título vazio vira 'Sem título' e as pontas são aparadas", () => {
    expect(paths([page("a", "   "), page("b", "  Com espaços  ")])).toEqual([
      "Sem título",
      "Com espaços",
    ]);
  });

  it("página cujo pai não está na lista (na lixeira) sobe para a raiz", () => {
    expect(paths([page("a", "Órfã", "sumiu")])).toEqual(["Órfã"]);
  });

  it("ciclos nos dados não travam", () => {
    const result = paths([page("a", "A", "b"), page("b", "B", "a")]);

    expect(result).toEqual([]); // sem raiz alcançável, nada a exportar (e sem loop infinito)
  });

  it("lista vazia", () => {
    expect(planExport([])).toEqual([]);
  });
});
