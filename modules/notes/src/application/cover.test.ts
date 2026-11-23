import { describe, expect, it } from "vitest";
import {
  COVER_COLORS,
  COVER_GRADIENTS,
  coverImageFromLink,
  coverOf,
  coverStyle,
  parseCover,
} from "./cover.ts";

describe("capa: leitura do texto guardado", () => {
  it("lê cor, degradê e imagem", () => {
    expect(parseCover("color:#aabbcc")).toEqual({ kind: "color", hex: "#aabbcc" });
    expect(parseCover("gradient:aurora")).toEqual({ kind: "gradient", id: "aurora" });
    expect(parseCover("image:https://exemplo.com/a.png")).toEqual({
      kind: "image",
      url: "https://exemplo.com/a.png",
    });
  });

  it("sem capa ou formato desconhecido: nenhuma capa, sem erro", () => {
    for (const bad of [
      null,
      "",
      "color:red",
      "color:#abc",
      "gradient:",
      "image:",
      "outra-coisa:x",
      "https://x.com/a.png",
    ]) {
      expect(parseCover(bad as string | null), String(bad)).toBeNull();
    }
  });

  it("monta o texto a partir de cada tipo (cor em minúsculas)", () => {
    expect(coverOf.color("#AABBCC")).toBe("color:#aabbcc");
    expect(coverOf.gradient("oceano")).toBe("gradient:oceano");
    expect(coverOf.image("https://x.com/a.png")).toBe("image:https://x.com/a.png");
  });
});

describe("capa: galeria", () => {
  it("todo degradê da galeria tem um nome que o Rust aceita (minúsculas, números, hífen; até 32)", () => {
    for (const gradient of COVER_GRADIENTS) {
      expect(gradient.id, gradient.id).toMatch(/^[a-z0-9-]{1,32}$/);
      expect(gradient.css).toMatch(/^linear-gradient\(/);
    }
    expect(new Set(COVER_GRADIENTS.map((g) => g.id)).size).toBe(COVER_GRADIENTS.length);
  });

  it("toda cor da galeria é um hexadecimal de 6 dígitos que o Rust aceita", () => {
    for (const color of COVER_COLORS) expect(color.hex, color.label).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("capa: estilo da faixa", () => {
  it("sem capa, não há estilo", () => {
    expect(coverStyle(null)).toBeNull();
    expect(coverStyle("lixo")).toBeNull();
  });

  it("cor e degradê viram o fundo certo", () => {
    expect(coverStyle("color:#112233")).toEqual({ backgroundColor: "#112233" });
    expect(coverStyle("gradient:aurora")).toEqual({ backgroundImage: COVER_GRADIENTS[0]!.css });
  });

  it("degradê desconhecido usa um fundo neutro em vez de quebrar", () => {
    const style = coverStyle("gradient:de-uma-versao-futura")!;

    expect(style.backgroundImage).toMatch(/^linear-gradient/);
  });

  it("imagem vira url(...) cobrindo a faixa", () => {
    expect(coverStyle("image:https://exemplo.com/a.png")).toEqual({
      backgroundImage: 'url("https://exemplo.com/a.png")',
      backgroundSize: "cover",
      backgroundPosition: "center",
    });
  });

  it("caracteres que fechariam o url(...) são codificados (defesa extra)", () => {
    const style = coverStyle('image:https://x.com/a").evil{b:url(c\\d e')!;

    // O que importa: DENTRO das aspas do url("...") não pode sobrar aspa, barra invertida nem espaço, que
    // permitiriam "fechar" o valor e injetar outras regras de estilo.
    const inner = /^url\("(.*)"\)$/.exec(style.backgroundImage!)![1]!;
    expect(inner).not.toMatch(/["\\\s]/);
    expect(inner.startsWith("https://x.com/a%22")).toBe(true);
  });
});

describe("capa: imagem por link", () => {
  it("aceita http e https, e recusa o resto", () => {
    expect(coverImageFromLink("https://exemplo.com/a.png")).toBe("image:https://exemplo.com/a.png");
    expect(coverImageFromLink("exemplo.com/a.png")).toBe("image:https://exemplo.com/a.png");
    expect(coverImageFromLink("javascript:alert(1)")).toBeNull();
    expect(coverImageFromLink("")).toBeNull();
  });
});
