import { describe, expect, it } from "vitest";
import { INBOX_TITLE, MAX_CAPTURE_CHARS, captureToPage, findInbox } from "./quick-capture.ts";
import { aSummary } from "../test-support.ts";

describe("captureToPage", () => {
  it("a primeira linha é o título e as demais viram parágrafos", () => {
    const page = captureToPage("Ideia de projeto\nprimeira nota\n\nsegunda nota")!;

    expect(page.title).toBe("Ideia de projeto");
    expect(page.body).toBe("primeira nota\nsegunda nota");
    expect(page.blocks.map((b) => b.content[0]!.text)).toEqual(["primeira nota", "segunda nota"]);
  });

  it("uma linha só vira só o título, sem blocos", () => {
    const page = captureToPage("  Comprar pão  ")!;

    expect(page).toMatchObject({ title: "Comprar pão", body: "" });
    expect(page.blocks).toEqual([]);
  });

  it("ignora linhas vazias no começo, espaços nas pontas e quebras de linha do Windows", () => {
    expect(captureToPage("\n\n  Título \r\n texto \r\n")).toMatchObject({
      title: "Título",
      body: "texto",
    });
  });

  it("texto vazio ou só espaços não vira página", () => {
    expect(captureToPage("")).toBeNull();
    expect(captureToPage("  \n \t \n")).toBeNull();
  });

  it("título longo é cortado em 200 caracteres e o texto gigante em 20 mil", () => {
    expect(captureToPage("a".repeat(500))!.title).toHaveLength(200);
    const huge = captureToPage(`T\n${"x".repeat(MAX_CAPTURE_CHARS * 2)}`)!;
    expect(huge.body.length).toBeLessThan(MAX_CAPTURE_CHARS);
  });
});

describe("findInbox", () => {
  const base = { parentId: null, isDatabase: false };

  it("acha a Caixa de entrada da raiz sem diferenciar maiúsculas nem espaços nas pontas", () => {
    const inbox = aSummary({ id: "x", title: "  caixa DE entrada ", ...base });

    expect(findInbox([aSummary({ id: "y", title: "Outra" }), inbox])).toBe(inbox);
  });

  it("ignora a que não está na raiz e a que é base de dados", () => {
    expect(findInbox([aSummary({ title: INBOX_TITLE, parentId: "p" })])).toBeUndefined();
    expect(findInbox([aSummary({ title: INBOX_TITLE, isDatabase: true })])).toBeUndefined();
    expect(findInbox([])).toBeUndefined();
  });
});
