// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, readTheme, saveTheme } from "./theme";

describe("tema", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("sem escolha guardada, segue o sistema", () => {
    expect(readTheme()).toBe("system");
  });

  it("lembra claro e escuro", () => {
    saveTheme("dark");
    expect(readTheme()).toBe("dark");
    saveTheme("light");
    expect(readTheme()).toBe("light");
  });

  it("quem já usava o nome antigo do app mantém o tema escolhido", () => {
    localStorage.setItem("aun.theme", "dark");

    expect(readTheme()).toBe("dark");
  });

  it("a preferência nova vale mais que a antiga", () => {
    localStorage.setItem("aun.theme", "dark");
    saveTheme("light");

    expect(readTheme()).toBe("light");
  });

  it("um valor inválido guardado vira 'sistema'", () => {
    localStorage.setItem("aesthetic.theme", "roxo");

    expect(readTheme()).toBe("system");
  });

  it("aplica o tema forçado e remove o atributo ao voltar para o sistema", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    applyTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("sem armazenamento disponível, não quebra", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("bloqueado");
      },
    });
    try {
      expect(readTheme()).toBe("system");
      expect(() => saveTheme("dark")).not.toThrow();
    } finally {
      Object.defineProperty(window, "localStorage", original);
    }
  });
});
