import { describe, expect, it } from "vitest";
import { COLUMN, COLUMN_LIST } from "./columns.ts";
import { blocksToMarkdown, type MdBlock } from "./markdown.ts";
import { blocksToPlainText, childPageIds, type Block } from "./page-content.ts";

const text = (id: string, value: string): Block => ({
  id,
  type: "paragraph",
  content: [{ type: "text", text: value, styles: {} }],
  children: [],
});
const page = (id: string, pageId: string): Block => ({
  id,
  type: "childPage",
  props: { pageId },
  children: [],
});
const col = (id: string, ...children: Block[]): Block => ({ id, type: COLUMN, children });
const cols = (id: string, ...columns: Block[]): Block => ({
  id,
  type: COLUMN_LIST,
  children: columns,
});

/** Uma página com texto solto, duas colunas (a segunda com uma subpágina) e mais texto no fim. */
const doc = (): Block[] => [
  text("a", "Antes"),
  cols(
    "L",
    col("c1", text("b", "Esquerda 1"), text("c", "Esquerda 2")),
    col("c2", text("d", "Direita"), page("p", "sub1")),
  ),
  text("e", "Depois"),
];

describe("colunas no texto, na busca e na exportação", () => {
  it("o texto simples (busca) inclui o conteúdo de todas as colunas, na ordem de leitura", () => {
    expect(blocksToPlainText(doc())).toBe("Antes\nEsquerda 1\nEsquerda 2\nDireita\nDepois");
  });

  it("subpáginas dentro de colunas continuam sendo achadas (a árvore de páginas depende disso)", () => {
    expect(childPageIds(doc())).toEqual(["sub1"]);
  });

  it("o Markdown lê as colunas em sequência (uma depois da outra), sem lixo da estrutura", () => {
    const markdown = blocksToMarkdown(doc() as unknown as MdBlock[], (id) =>
      id === "sub1" ? "Minha sub" : null,
    );

    expect(markdown).toContain("Esquerda 1");
    expect(markdown).toContain("Direita");
    expect(markdown.indexOf("Esquerda 2")).toBeLessThan(markdown.indexOf("Direita"));
    expect(markdown.indexOf("Antes")).toBeLessThan(markdown.indexOf("Esquerda 1"));
    expect(markdown.indexOf("Direita")).toBeLessThan(markdown.indexOf("Depois"));
    expect(markdown).not.toMatch(/columnList|column\b/);
  });
});
