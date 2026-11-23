import { describe, expect, it } from "vitest";
import {
  blocksToPlainText,
  childPageIds,
  parseContent,
  planChildPageSync,
  removedChildPageIds,
  textToBlocks,
  type Block,
} from "./page-content.ts";

const para = (text: string, id?: string): Block => ({
  ...(id ? { id } : {}),
  type: "paragraph",
  content: [{ type: "text", text, styles: {} }],
});
const child = (pageId: string, id: string): Block => ({ id, type: "childPage", props: { pageId } });

describe("conversão do texto antigo em blocos", () => {
  it("cada linha vira um parágrafo; texto vazio não gera bloco", () => {
    expect(textToBlocks("a\nb\r\nc")).toEqual([
      { type: "paragraph", content: "a" },
      { type: "paragraph", content: "b" },
      { type: "paragraph", content: "c" },
    ]);
    expect(textToBlocks("")).toEqual([]);
    expect(textToBlocks("  \n ")).toEqual([]);
  });

  it("usa os blocos gravados quando existem", () => {
    const blocks = [para("já em blocos")];

    expect(parseContent(JSON.stringify(blocks), "texto antigo ignorado")).toEqual(blocks);
  });

  it("página antiga (conteúdo vazio) é convertida a partir do texto simples", () => {
    expect(parseContent("[]", "primeira\nsegunda")).toEqual(textToBlocks("primeira\nsegunda"));
  });

  it("conteúdo ilegível não quebra: cai no texto simples", () => {
    expect(parseContent("não é json", "salvo")).toEqual(textToBlocks("salvo"));
    expect(parseContent('{"não":"é lista"}', "salvo")).toEqual(textToBlocks("salvo"));
  });
});

describe("texto simples dos blocos", () => {
  it("junta o texto de cada bloco, em linhas", () => {
    expect(blocksToPlainText([para("um"), para("dois")])).toBe("um\ndois");
  });

  it("entende texto direto, links e blocos aninhados; ignora blocos vazios e subpáginas", () => {
    const blocks: Block[] = [
      { type: "paragraph", content: "direto" },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "veja ", styles: {} },
          { type: "link", href: "x", content: [{ type: "text", text: "o link", styles: {} }] },
        ],
      },
      { type: "paragraph", content: [] },
      child("p1", "b1"),
      { ...para("pai"), children: [para("filho")] },
    ];

    expect(blocksToPlainText(blocks)).toBe("direto\nveja o link\npai\nfilho");
  });

  it("extrai o texto das células de uma tabela", () => {
    const table: Block = {
      type: "table",
      content: {
        rows: [
          { cells: [[{ type: "text", text: "a" }], [{ type: "text", text: "b" }]] },
          { cells: [[{ type: "text", text: "c" }], [{ type: "text", text: "d" }]] },
        ],
      },
    };

    expect(blocksToPlainText([table])).toBe("a\tb\nc\td");
  });
});

describe("blocos de subpágina", () => {
  it("lista as páginas apontadas, na ordem, inclusive em blocos aninhados", () => {
    const blocks: Block[] = [child("a", "1"), { ...para("x"), children: [child("b", "2")] }];

    expect(childPageIds(blocks)).toEqual(["a", "b"]);
  });

  it("detecta quais blocos o usuário apagou", () => {
    expect(removedChildPageIds(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
    expect(removedChildPageIds(["a"], ["a"])).toEqual([]);
    expect(removedChildPageIds(["a", "a"], [])).toEqual(["a"]); // sem repetir
  });
});

describe("sincronizar os blocos com a árvore", () => {
  it("subpágina ativa sem bloco ganha um (no fim)", () => {
    const plan = planChildPageSync([para("texto")], ["a", "b"]);

    expect(plan).toEqual({ toInsert: ["a", "b"], toRemove: [] });
  });

  it("tudo em dia: nada a fazer", () => {
    const plan = planChildPageSync([child("a", "1"), para("x"), child("b", "2")], ["a", "b"]);

    expect(plan).toEqual({ toInsert: [], toRemove: [] });
  });

  it("bloco de página que não é mais filha (movida ou excluída) é removido", () => {
    const plan = planChildPageSync([child("a", "1"), child("fora", "2")], ["a"]);

    expect(plan).toEqual({ toInsert: [], toRemove: ["2"] });
  });

  it("bloco repetido para a mesma página: fica o primeiro", () => {
    const plan = planChildPageSync([child("a", "1"), child("a", "2")], ["a"]);

    expect(plan).toEqual({ toInsert: [], toRemove: ["2"] });
  });

  it("bloco sem página (vazio) é removido", () => {
    const plan = planChildPageSync([child("", "1")], []);

    expect(plan.toRemove).toEqual(["1"]);
  });

  it("página recém-criada (ainda fora da lista) é protegida de ser removida", () => {
    const plan = planChildPageSync([child("nova", "1")], [], new Set(["nova"]));

    expect(plan).toEqual({ toInsert: [], toRemove: [] });
  });

  it("a proteção não duplica: se a página protegida já tem bloco, nada é inserido", () => {
    const plan = planChildPageSync([child("nova", "1")], ["nova"], new Set(["nova"]));

    expect(plan).toEqual({ toInsert: [], toRemove: [] });
  });

  it("enquanto a lista de subpáginas é vazia, tudo que não é protegido sairia: por isso o editor só sincroniza com a lista carregada", () => {
    // Documenta o perigo: com lista vazia, blocos válidos seriam apontados para remoção.
    const plan = planChildPageSync([child("a", "1")], []);

    expect(plan.toRemove).toEqual(["1"]);
  });
});
