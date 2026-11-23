import { describe, expect, it } from "vitest";
import { filterEmojis, type EmojiEntry } from "./emoji.ts";

const E = (emoji: string, label: string, tags: string[] = []): EmojiEntry => ({
  emoji,
  label,
  tags,
  category: 0,
});
const emojis = [
  E("❤️", "coração vermelho", ["amor"]),
  E("🚀", "foguete", ["espaço", "lançamento"]),
  E("🐶", "rosto de cachorro", ["animal", "pet"]),
  E("🐱", "rosto de gato", ["animal", "pet"]),
];

describe("busca de emojis", () => {
  it("busca vazia devolve todos", () => {
    expect(filterEmojis(emojis, "")).toHaveLength(4);
    expect(filterEmojis(emojis, "   ")).toHaveLength(4);
  });

  it("não diferencia acentos nem maiúsculas", () => {
    expect(filterEmojis(emojis, "CORACAO").map((e) => e.emoji)).toEqual(["❤️"]);
    expect(filterEmojis(emojis, "espaco").map((e) => e.emoji)).toEqual(["🚀"]);
  });

  it("procura também nas palavras-chave", () => {
    expect(filterEmojis(emojis, "pet").map((e) => e.emoji)).toEqual(["🐶", "🐱"]);
  });

  it("várias palavras: todas precisam aparecer", () => {
    expect(filterEmojis(emojis, "rosto gato").map((e) => e.emoji)).toEqual(["🐱"]);
    expect(filterEmojis(emojis, "rosto foguete")).toEqual([]);
  });

  it("sem resultado, lista vazia", () => {
    expect(filterEmojis(emojis, "xyz")).toEqual([]);
  });
});
