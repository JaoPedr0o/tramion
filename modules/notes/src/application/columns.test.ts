import { describe, expect, it } from "vitest";
import {
  COLUMN,
  COLUMN_LIST,
  MAX_COLUMNS,
  containsId,
  dropBeside,
  findBlock,
  newColumns,
  normalizeColumns,
} from "./columns.ts";
import type { Block } from "./page-content.ts";

const p = (id: string, children: Block[] = []): Block => ({ id, type: "paragraph", children });
const col = (id: string, ...children: Block[]): Block => ({ id, type: COLUMN, children });
const cols = (id: string, ...columns: Block[]): Block => ({
  id,
  type: COLUMN_LIST,
  children: columns,
});

/** O desenho da árvore como texto: `a`, `[ [a] [b c] ]` (lista de colunas), para os testes ficarem legíveis. */
function shape(blocks: readonly Block[]): string {
  return blocks
    .map((b) => {
      const kids = shape(b.children ?? []);
      if (b.type === COLUMN_LIST) return `[${kids}]`;
      if (b.type === COLUMN) return `(${kids})`;
      return kids ? `${b.id}{${kids}}` : b.id!;
    })
    .join(" ");
}

describe("dropBeside: bloco solto vira duas colunas", () => {
  it("à direita: alvo na coluna da esquerda, arrastado na da direita", () => {
    expect(shape(dropBeside([p("a"), p("b"), p("c")], "a", "c", "right")!)).toBe("[(a) (c)] b");
  });

  it("à esquerda: arrastado na coluna da esquerda", () => {
    expect(shape(dropBeside([p("a"), p("b"), p("c")], "b", "c", "left")!)).toBe("a [(c) (b)]");
  });

  it("o bloco arrastado sai do lugar de onde estava (não fica duplicado)", () => {
    const next = dropBeside([p("a"), p("b"), p("c")], "c", "a", "right")!;

    expect(shape(next)).toBe("b [(c) (a)]");
    expect(next.flatMap((b) => JSON.stringify(b).match(/"id":"a"/g) ?? [])).toHaveLength(1);
  });

  it("o bloco carrega as subpáginas e os filhos que tem (recuados continuam dentro dele)", () => {
    const next = dropBeside([p("a"), p("b", [p("b1")])], "a", "b", "right")!;

    expect(shape(next)).toBe("[(a) (b{b1})]");
  });
});

describe("dropBeside: já há colunas", () => {
  const base = (): Block[] => [cols("L", col("c1", p("a")), col("c2", p("b"))), p("x")];

  it("ao lado de um bloco que já está numa coluna, ganha uma coluna nova ao lado dela", () => {
    expect(shape(dropBeside(base(), "a", "x", "left")!)).toBe("[(x) (a) (b)]");
    expect(shape(dropBeside(base(), "b", "x", "right")!)).toBe("[(a) (b) (x)]");
    expect(shape(dropBeside(base(), "a", "x", "right")!)).toBe("[(a) (x) (b)]");
  });

  it("não passa do máximo de colunas", () => {
    const full: Block[] = [
      cols("L", ...Array.from({ length: MAX_COLUMNS }, (_, i) => col(`c${i}`, p(`p${i}`)))),
      p("x"),
    ];

    expect(dropBeside(full, "p0", "x", "left")).toBeNull();
  });

  it("tirar o último bloco de uma coluna desfaz a coluna; sobrando uma só, a lista some", () => {
    // Arrasta "b" (única da coluna c2) para o lado de "x": c2 esvazia e a lista fica com uma coluna só.
    expect(shape(dropBeside(base(), "x", "b", "right")!)).toBe("a [(x) (b)]");
  });

  it("mover um bloco de uma lista de colunas para outra funciona (e a lista que esvaziou some)", () => {
    const two: Block[] = [
      cols("L1", col("a1", p("a")), col("a2", p("b"))),
      cols("L2", col("b1", p("c")), col("b2", p("d"))),
    ];

    expect(shape(dropBeside(two, "c", "a", "right")!)).toBe("b [(c) (a) (d)]");
  });
});

describe("dropBeside: pedidos inválidos devolvem null", () => {
  const doc = (): Block[] => [
    p("a", [p("a1")]),
    p("b"),
    cols("L", col("c1", p("x")), col("c2", p("y"))),
  ];

  it("soltar um bloco ao lado dele mesmo", () => {
    expect(dropBeside(doc(), "a", "a", "right")).toBeNull();
  });

  it("soltar um bloco ao lado de um filho dele (dentro de si mesmo)", () => {
    expect(dropBeside(doc(), "a1", "a", "right")).toBeNull();
  });

  it("ids que não existem", () => {
    expect(dropBeside(doc(), "nada", "b", "right")).toBeNull();
    expect(dropBeside(doc(), "a", "nada", "right")).toBeNull();
  });

  it("arrastar a própria estrutura de colunas", () => {
    expect(dropBeside(doc(), "a", "L", "right")).toBeNull();
    expect(dropBeside(doc(), "a", "c1", "right")).toBeNull();
  });

  it("soltar ao lado da lista de colunas inteira", () => {
    expect(dropBeside(doc(), "L", "b", "right")).toBeNull();
  });

  it("não altera a árvore original", () => {
    const original = doc();
    const snapshot = JSON.stringify(original);

    dropBeside(original, "a", "b", "right");

    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe("normalizeColumns", () => {
  it("uma árvore válida não muda", () => {
    const valid = [p("a"), cols("L", col("c1", p("x")), col("c2", p("y"))), p("z")];

    const result = normalizeColumns(valid);

    expect(result.changed).toBe(false);
    expect(shape(result.blocks)).toBe(shape(valid));
  });

  it("tira colunas vazias", () => {
    const result = normalizeColumns([cols("L", col("c1", p("x")), col("c2"), col("c3", p("y")))]);

    expect(result.changed).toBe(true);
    expect(shape(result.blocks)).toBe("[(x) (y)]");
  });

  it("lista com uma coluna só vira os blocos soltos na página, na mesma posição", () => {
    const result = normalizeColumns([
      p("a"),
      cols("L", col("c1", p("x"), p("y")), col("c2")),
      p("z"),
    ]);

    expect(shape(result.blocks)).toBe("a x y z");
  });

  it("lista sem nenhuma coluna com conteúdo desaparece", () => {
    expect(shape(normalizeColumns([p("a"), cols("L", col("c1"), col("c2"))]).blocks)).toBe("a");
  });

  it("coluna solta (fora de uma lista) é desfeita", () => {
    expect(shape(normalizeColumns([col("c1", p("x"), p("y")), p("z")]).blocks)).toBe("x y z");
  });

  it("bloco que não é coluna dentro da lista sai para depois dela", () => {
    const result = normalizeColumns([
      cols("L", col("c1", p("x")), col("c2", p("y")), p("intruso")),
    ]);

    expect(shape(result.blocks)).toBe("[(x) (y)] intruso");
  });

  it("funciona dentro de blocos recuados e é idempotente", () => {
    const once = normalizeColumns([p("a", [cols("L", col("c1", p("x")), col("c2"))])]);
    const twice = normalizeColumns(once.blocks);

    expect(shape(once.blocks)).toBe("a{x}");
    expect(twice.changed).toBe(false);
  });
});

describe("newColumns e utilitários", () => {
  it("cria a lista com o número pedido de colunas, cada uma com um parágrafo vazio", () => {
    const list = newColumns(3);

    expect(list.type).toBe(COLUMN_LIST);
    expect(list.children).toHaveLength(3);
    expect(list.children!.every((c) => c.type === COLUMN && c.children?.length === 1)).toBe(true);
    expect(list.children![0]!.children![0]!.type).toBe("paragraph");
  });

  it("limita entre 2 e o máximo", () => {
    expect(newColumns(1).children).toHaveLength(2);
    expect(newColumns(99).children).toHaveLength(MAX_COLUMNS);
  });

  it("findBlock e containsId enxergam qualquer nível", () => {
    const doc = [p("a", [p("a1", [p("a2")])]), cols("L", col("c1", p("x")))];

    expect(findBlock(doc, "a2")?.id).toBe("a2");
    expect(findBlock(doc, "x")?.id).toBe("x");
    expect(findBlock(doc, "nada")).toBeNull();
    expect(containsId(doc[0]!, "a2")).toBe(true);
    expect(containsId(doc[0]!, "x")).toBe(false);
  });
});
