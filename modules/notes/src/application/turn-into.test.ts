import { describe, expect, it } from "vitest";
import { isCurrentOption, TURN_INTO_OPTIONS, TURNABLE_TYPES } from "./turn-into.ts";

const option = (id: string) => TURN_INTO_OPTIONS.find((o) => o.id === id)!;

describe("Transformar em", () => {
  it("oferece os tipos de texto do editor, com ids e rótulos únicos", () => {
    const ids = TURN_INTO_OPTIONS.map((o) => o.id);
    const labels = TURN_INTO_OPTIONS.map((o) => o.label);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Texto",
        "Título 1",
        "Título 2",
        "Título 3",
        "Lista de tarefas",
        "Código",
      ]),
    );
  });

  it("os títulos carregam o nível", () => {
    expect(option("heading-1").props).toEqual({ level: 1 });
    expect(option("heading-3").props).toEqual({ level: 3 });
  });

  it("só blocos de texto podem ser transformados", () => {
    for (const type of [
      "paragraph",
      "heading",
      "bulletListItem",
      "checkListItem",
      "quote",
      "codeBlock",
    ]) {
      expect(TURNABLE_TYPES.has(type), type).toBe(true);
    }
    for (const type of [
      "image",
      "video",
      "table",
      "childPage",
      "bookmark",
      "embedVideo",
      "divider",
    ]) {
      expect(TURNABLE_TYPES.has(type), type).toBe(false);
    }
  });

  it("reconhece o tipo atual do bloco, e os títulos pelo nível", () => {
    expect(isCurrentOption({ type: "paragraph" }, option("paragraph"))).toBe(true);
    expect(isCurrentOption({ type: "quote" }, option("paragraph"))).toBe(false);
    expect(isCurrentOption({ type: "heading", props: { level: 2 } }, option("heading-2"))).toBe(
      true,
    );
    expect(isCurrentOption({ type: "heading", props: { level: 2 } }, option("heading-1"))).toBe(
      false,
    );
  });
});
