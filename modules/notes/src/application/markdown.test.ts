import { describe, expect, it } from "vitest";
import {
  blocksToMarkdown,
  markdownToBlocks,
  parseInline,
  splitImportedTitle,
  type MdBlock,
} from "./markdown.ts";

const text = (value: string, styles: Record<string, boolean> = {}) => ({
  type: "text",
  text: value,
  styles,
});
const para = (value: string): MdBlock => ({
  type: "paragraph",
  content: [text(value)],
  children: [],
});
const titles: Record<string, string> = { p1: "Outra página" };
const titleOf = (id: string) => titles[id] ?? null;
const md = (blocks: MdBlock[]) => blocksToMarkdown(blocks, titleOf);

describe("exportar para Markdown", () => {
  it("parágrafos e títulos, com linha em branco entre os blocos", () => {
    expect(
      md([
        { type: "heading", props: { level: 1 }, content: [text("Título")] },
        para("Primeiro."),
        { type: "heading", props: { level: 3 }, content: [text("Sub")] },
        para("Segundo."),
      ]),
    ).toBe("# Título\n\nPrimeiro.\n\n### Sub\n\nSegundo.\n");
  });

  it("estilos em linha (negrito, itálico, riscado, código) mantendo os espaços fora das marcas", () => {
    expect(
      md([
        {
          type: "paragraph",
          content: [
            text("a "),
            text("forte ", { bold: true }),
            text("inclinado", { italic: true }),
            text(" "),
            text("cortado", { strike: true }),
            text(" "),
            text("x = 1", { code: true }),
          ],
        },
      ]),
    ).toBe("a **forte** *inclinado* ~~cortado~~ `x = 1`\n");
  });

  it("escapa os caracteres que virariam formatação", () => {
    expect(md([para("2 * 3 = [seis] e _x_")])).toBe("2 \\* 3 = \\[seis\\] e \\_x\\_\n");
  });

  it("links e menções a páginas", () => {
    expect(
      md([
        {
          type: "paragraph",
          content: [
            { type: "link", href: "https://exemplo.com", content: [text("site")] },
            text(" e "),
            { type: "mention", props: { pageId: "p1" } },
            text(" e "),
            { type: "mention", props: { pageId: "sumiu" } },
          ],
        },
      ]),
    ).toBe("[site](https://exemplo.com) e @Outra página e @página\n");
  });

  it("listas seguidas ficam juntas, numeradas contam, tarefas marcam e filhas recuam", () => {
    expect(
      md([
        {
          type: "bulletListItem",
          content: [text("a")],
          children: [{ type: "bulletListItem", content: [text("a1")] }],
        },
        { type: "bulletListItem", content: [text("b")] },
        para("fim da lista"),
        { type: "numberedListItem", content: [text("um")] },
        { type: "numberedListItem", content: [text("dois")] },
        { type: "checkListItem", props: { checked: true }, content: [text("feito")] },
        { type: "checkListItem", props: { checked: false }, content: [text("a fazer")] },
      ]),
    ).toBe("- a\n  - a1\n- b\n\nfim da lista\n\n1. um\n2. dois\n- [x] feito\n- [ ] a fazer\n");
  });

  it("citação, código com e sem linguagem, e imagem", () => {
    expect(
      md([
        { type: "quote", content: [text("sábio")] },
        { type: "codeBlock", props: { language: "python" }, content: [text("print(1)\nprint(2)")] },
        { type: "codeBlock", props: { language: "text" }, content: [text("solto")] },
        { type: "image", props: { url: "https://x.com/a.png", caption: "foto" } },
        { type: "image", props: { url: "" } },
      ]),
    ).toBe(
      "> sábio\n\n```python\nprint(1)\nprint(2)\n```\n\n```\nsolto\n```\n\n![foto](https://x.com/a.png)\n",
    );
  });

  it("bookmark, vídeo, subpágina e tabela", () => {
    expect(
      md([
        { type: "bookmark", props: { url: "https://a.com" } },
        { type: "embedVideo", props: { url: "https://youtu.be/x" } },
        { type: "childPage", props: { pageId: "p1" } },
        { type: "childPage", props: { pageId: "desconhecida" } },
        {
          type: "table",
          content: {
            type: "tableContent",
            rows: [
              { cells: [[text("Nome")], [text("Qtd")]] },
              { cells: [[text("pão | integral")], [text("2")]] },
            ],
          },
        },
      ]),
    ).toBe(
      "<https://a.com>\n\n<https://youtu.be/x>\n\nSubpágina: Outra página\n\nSubpágina: sem título\n\n| Nome | Qtd |\n| --- | --- |\n| pão \\| integral | 2 |\n",
    );
  });

  it("blocos vazios somem; página vazia vira texto vazio", () => {
    expect(md([para(""), { type: "paragraph", content: [] }])).toBe("");
    expect(md([])).toBe("");
    expect(md([para("a"), para(""), para("b")])).toBe("a\n\nb\n");
  });
});

describe("importar de Markdown", () => {
  const types = (source: string) => markdownToBlocks(source).map((b) => b.type);

  it("reconhece títulos (até o nível 3), citação, lista, tarefa e código", () => {
    const blocks = markdownToBlocks(
      "# Um\n## Dois\n#### Quatro\n> citado\n- a\n- b\n1. x\n2. y\n- [x] pronto\n- [ ] falta\n```js\nlet a = 1;\n```\n",
    );

    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "heading",
      "heading",
      "quote",
      "bulletListItem",
      "bulletListItem",
      "numberedListItem",
      "numberedListItem",
      "checkListItem",
      "checkListItem",
      "codeBlock",
    ]);
    expect(blocks.map((b) => b.props?.level)).toEqual([
      1,
      2,
      3,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(blocks[8]!.props).toEqual({ checked: true });
    expect(blocks[9]!.props).toEqual({ checked: false });
    expect(blocks[10]!.props).toEqual({ language: "js" });
    expect(blocks[10]!.content).toEqual([text("let a = 1;")]);
  });

  it("linhas seguidas viram um parágrafo; linha em branco separa; linha horizontal só separa", () => {
    expect(types("uma\nlinha\n\noutra\n\n---\n\nfim")).toEqual([
      "paragraph",
      "paragraph",
      "paragraph",
    ]);
    expect((markdownToBlocks("uma\nlinha")[0]!.content as Array<{ text: string }>)[0]!.text).toBe(
      "uma linha",
    );
  });

  it("aninha listas pela indentação e volta ao nível certo", () => {
    const blocks = markdownToBlocks("- a\n  - a1\n    - a1x\n  - a2\n- b");

    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.children).toHaveLength(2);
    expect(blocks[0]!.children![0]!.children).toHaveLength(1);
    expect(blocks[0]!.children![1]!.children).toHaveLength(0);
    expect(blocks[1]!.children).toHaveLength(0);
  });

  it("código ignora o resto das regras e fecha com a mesma cerca; sem fechar, vai até o fim", () => {
    expect(markdownToBlocks("```\n# não é título\n- nem lista\n```")).toHaveLength(1);
    const open = markdownToBlocks("```py\nx = 1");
    expect(open).toHaveLength(1);
    expect(open[0]!.props).toEqual({ language: "py" });
    expect(markdownToBlocks("~~~\na\n~~~")[0]!.props).toEqual({ language: "text" });
  });

  it("tabelas viram bloco de tabela, com células escapadas", () => {
    const [table] = markdownToBlocks("| Nome | Qtd |\n| --- | :---: |\n| pão \\| integral | 2 |\n");

    expect(table!.type).toBe("table");
    const rows = (table!.content as { rows: Array<{ cells: unknown[][] }> }).rows;
    expect(rows).toHaveLength(2);
    expect(rows[1]!.cells[0]).toEqual([text("pão | integral")]);
  });

  it("imagem só com http(s); outros endereços viram texto", () => {
    expect(types("![foto](https://x.com/a.png)")).toEqual(["image"]);
    expect(markdownToBlocks("![foto](https://x.com/a.png)")[0]!.props).toEqual({
      url: "https://x.com/a.png",
      caption: "foto",
    });
    expect(types("![foto](file:///etc/passwd)")).toEqual(["paragraph"]);
    expect(types("![foto](javascript:alert(1))")).toEqual(["paragraph"]);
    expect(types("![foto](./local.png)")).toEqual(["paragraph"]);
  });

  it("quebras de linha do Windows e entrada vazia", () => {
    expect(types("# A\r\n\r\ntexto\r\n")).toEqual(["heading", "paragraph"]);
    expect(markdownToBlocks("")).toEqual([]);
    expect(markdownToBlocks("\n\n  \n")).toEqual([]);
  });
});

describe("estilos em linha na importação", () => {
  it("negrito, itálico, riscado e código", () => {
    expect(parseInline("a **b** *c* ~~d~~ `e`")).toEqual([
      text("a "),
      text("b", { bold: true }),
      text(" "),
      text("c", { italic: true }),
      text(" "),
      text("d", { strike: true }),
      text(" "),
      text("e", { code: true }),
    ]);
  });

  it("estilos aninhados e underscores", () => {
    expect(parseInline("**forte e *inclinado***")).toEqual([
      text("forte e ", { bold: true }),
      text("inclinado", { bold: true, italic: true }),
    ]);
    expect(parseInline("__b__ _i_")).toEqual([
      text("b", { bold: true }),
      text(" "),
      text("i", { italic: true }),
    ]);
  });

  it("links http(s) viram link; outros esquemas viram texto", () => {
    expect(parseInline("[site](https://a.com)")).toEqual([
      { type: "link", href: "https://a.com", content: [text("site")] },
    ]);
    expect(parseInline("[x](javascript:alert(1))")).toEqual([text("[x](javascript:alert(1))")]);
    expect(parseInline("[x](file:///etc/passwd)")).toEqual([text("[x](file:///etc/passwd)")]);
  });

  it("escapes e marcas soltas ficam como texto; código não interpreta estilos", () => {
    expect(parseInline("2 \\* 3 * 4")).toEqual([text("2 * 3 * 4")]);
    expect(parseInline("`**não**`")).toEqual([text("**não**", { code: true })]);
    expect(parseInline("snake_case_name")).toEqual([text("snake_case_name")]);
    expect(parseInline("**sem fechar")).toEqual([text("**sem fechar")]);
  });
});

describe("título da página importada", () => {
  it("usa o primeiro título de nível 1 e o tira do texto", () => {
    const { title, blocks } = splitImportedTitle(
      markdownToBlocks("# Minha receita\n\npasso 1"),
      "x.md",
    );

    expect(title).toBe("Minha receita");
    expect(blocks.map((b) => b.type)).toEqual(["paragraph"]);
  });

  it("sem título, usa o nome do arquivo sem extensão; sem nada, 'Importado'", () => {
    expect(splitImportedTitle(markdownToBlocks("só texto"), "Notas da aula.md").title).toBe(
      "Notas da aula",
    );
    expect(splitImportedTitle([], "").title).toBe("Importado");
    expect(splitImportedTitle(markdownToBlocks("## Dois"), "doc.markdown").title).toBe("doc");
  });

  it("título gigante é cortado em 200 caracteres", () => {
    expect(splitImportedTitle(markdownToBlocks(`# ${"a".repeat(500)}`), "x").title).toHaveLength(
      200,
    );
  });
});

describe("ida e volta", () => {
  it("exportar e importar de novo preserva a estrutura", () => {
    const original: MdBlock[] = [
      { type: "heading", props: { level: 2 }, content: [text("Plano")] },
      { type: "paragraph", content: [text("um "), text("forte", { bold: true })] },
      { type: "checkListItem", props: { checked: true }, content: [text("feito")] },
      {
        type: "bulletListItem",
        content: [text("item")],
        children: [{ type: "bulletListItem", content: [text("filho")] }],
      },
      { type: "codeBlock", props: { language: "rust" }, content: [text("fn main() {}")] },
      { type: "quote", content: [text("citação")] },
    ];

    const again = markdownToBlocks(blocksToMarkdown(original));

    expect(again.map((b) => b.type)).toEqual(original.map((b) => b.type));
    expect(again[1]!.content).toEqual([text("um "), text("forte", { bold: true })]);
    expect(again[3]!.children![0]!.type).toBe("bulletListItem");
    expect(again[4]!.props).toEqual({ language: "rust" });
  });
});
