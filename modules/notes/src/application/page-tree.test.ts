import { describe, expect, it } from "vitest";
import { aSummary } from "../test-support.ts";
import { ancestorsOf, buildTree, moveTargets, visibleRows, type TreeNode } from "./page-tree.ts";

const page = (id: string, parentId: string | null = null, position = 0) =>
  aSummary({ id, title: id.toUpperCase(), parentId, position });

// A
// ├─ B
// │  └─ C
// └─ D
// E
const pages = [
  page("a", null, 0),
  page("e", null, 1),
  page("b", "a", 0),
  page("d", "a", 1),
  page("c", "b", 0),
];

const ids = (nodes: readonly TreeNode[]): unknown =>
  nodes.map((n) => (n.children.length ? [n.page.id, ids(n.children)] : n.page.id));

describe("árvore de páginas", () => {
  it("monta a árvore preservando a ordem entre irmãs", () => {
    expect(ids(buildTree(pages))).toEqual([["a", [["b", ["c"]], "d"]], "e"]);
  });

  it("página cujo pai não está na lista vira raiz em vez de sumir", () => {
    const tree = buildTree([page("x", "inexistente"), page("y")]);

    expect(ids(tree)).toEqual(["x", "y"]);
  });

  it("não entra em laço infinito com dados corrompidos (ciclo)", () => {
    const corrupted = [page("a", "b"), page("b", "a"), page("ok")];

    expect(() => buildTree(corrupted)).not.toThrow();
    expect(() => ancestorsOf(corrupted, "a")).not.toThrow();
  });

  it("ancestrais: da raiz até o pai, sem a própria página", () => {
    expect(ancestorsOf(pages, "c").map((p) => p.id)).toEqual(["a", "b"]);
    expect(ancestorsOf(pages, "a")).toEqual([]);
    expect(ancestorsOf(pages, "desconhecida")).toEqual([]);
  });

  it("linhas visíveis: só desce em páginas expandidas, com profundidade e irmãs", () => {
    const tree = buildTree(pages);

    const collapsed = visibleRows(tree, new Set());
    expect(collapsed.map((r) => r.page.id)).toEqual(["a", "e"]);
    expect(collapsed[0]).toMatchObject({ hasChildren: true, expanded: false, depth: 0 });

    const open = visibleRows(tree, new Set(["a", "b"]));
    expect(open.map((r) => [r.page.id, r.depth])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
      ["d", 1],
      ["e", 0],
    ]);
    expect(open.find((r) => r.page.id === "d")).toMatchObject({ position: 2, siblings: 2 });
  });

  it("expandir uma página sem filhas não faz nada", () => {
    const rows = visibleRows(buildTree(pages), new Set(["e"]));

    expect(rows.find((r) => r.page.id === "e")).toMatchObject({
      hasChildren: false,
      expanded: false,
    });
  });

  it("destinos de mover: a raiz e tudo, menos a própria página e as suas descendentes", () => {
    const targets = moveTargets(pages, "b");

    expect(targets.map((t) => t.id)).toEqual([null, "a", "d", "e"]);
    expect(targets[0]).toMatchObject({ title: "Raiz", depth: 0 });
    expect(targets.find((t) => t.id === "d")?.depth).toBe(2); // d está dentro de a
  });
});
