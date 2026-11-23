import { describe, expect, it } from "vitest";
import { layoutGraph } from "./graph-layout.ts";

const ids = (...names: string[]) => names.map((id) => ({ id }));
const dist = (map: ReadonlyMap<string, { x: number; y: number }>, a: string, b: string) =>
  Math.hypot(map.get(a)!.x - map.get(b)!.x, map.get(a)!.y - map.get(b)!.y);

describe("layoutGraph", () => {
  it("grafo vazio e nó único (no centro)", () => {
    expect(layoutGraph([], [], 800, 600).size).toBe(0);
    expect(layoutGraph(ids("a"), [], 800, 600).get("a")).toEqual({ x: 400, y: 300 });
  });

  it("é determinístico: a mesma entrada dá exatamente o mesmo desenho", () => {
    const nodes = ids("a", "b", "c", "d", "e");
    const edges = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "d", to: "e" },
    ];

    const first = layoutGraph(nodes, edges, 800, 600);
    const second = layoutGraph(nodes, edges, 800, 600);

    expect([...first]).toEqual([...second]);
  });

  it("todos os nós ficam dentro da área, com a margem, e sem NaN", () => {
    const nodes = ids(...Array.from({ length: 40 }, (_, i) => `n${i}`));
    const edges = nodes.slice(1).map((n, i) => ({ from: nodes[Math.floor(i / 2)]!.id, to: n.id }));

    const positions = layoutGraph(nodes, edges, 800, 600, 40);

    for (const { x, y } of positions.values()) {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(39.9);
      expect(x).toBeLessThanOrEqual(760.1);
      expect(y).toBeGreaterThanOrEqual(39.9);
      expect(y).toBeLessThanOrEqual(560.1);
    }
  });

  it("nós ligados ficam mais perto entre si do que de nós sem ligação", () => {
    const nodes = ids("a", "b", "c", "x", "y", "z");
    const edges = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "a", to: "c" },
      { from: "x", to: "y" },
      { from: "y", to: "z" },
      { from: "x", to: "z" },
    ];

    const p = layoutGraph(nodes, edges, 800, 600);

    expect(dist(p, "a", "b")).toBeLessThan(dist(p, "a", "x"));
    expect(dist(p, "x", "y")).toBeLessThan(dist(p, "b", "y"));
  });

  it("nós sem ligação não se sobrepõem", () => {
    const p = layoutGraph(ids("a", "b", "c", "d"), [], 800, 600);

    for (const [a, b] of [
      ["a", "b"],
      ["a", "c"],
      ["a", "d"],
      ["b", "c"],
      ["b", "d"],
      ["c", "d"],
    ] as const) {
      expect(dist(p, a, b)).toBeGreaterThan(20);
    }
  });

  it("ignora ligações para nós que não existem e ligações de um nó com ele mesmo", () => {
    const p = layoutGraph(
      ids("a", "b"),
      [
        { from: "a", to: "sumiu" },
        { from: "a", to: "a" },
        { from: "b", to: "a" },
      ],
      800,
      600,
    );

    expect(p.size).toBe(2);
    for (const { x, y } of p.values()) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
  });

  it("dois nós no mesmo lugar não geram NaN", () => {
    const p = layoutGraph(ids("a", "b", "c"), [], 100, 100, 10);

    for (const { x, y } of p.values()) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
  });
});
