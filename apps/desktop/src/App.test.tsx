// @vitest-environment jsdom
import type { ViewContribution, ViewRegistry } from "@aun/contracts";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function registry(...views: ViewContribution[]): ViewRegistry {
  return { register: () => {}, list: () => views };
}

const full: ViewContribution = {
  id: "um",
  title: "Primeira tela",
  sidebarActions: () => <button type="button">ação do módulo</button>,
  sidebar: () => <p>conteúdo da lateral</p>,
  topbar: () => <p>conteúdo do topo</p>,
  main: () => <p>conteúdo principal</p>,
};

describe("moldura do app", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("monta cada região com o que o módulo oferece", () => {
    render(<App views={registry(full)} />);

    const sidebar = screen.getByRole("complementary", { name: "Barra lateral" });
    expect(within(sidebar).getByText("conteúdo da lateral")).toBeTruthy();
    expect(within(sidebar).getByRole("button", { name: "ação do módulo" })).toBeTruthy();
    expect(within(screen.getByRole("banner")).getByText("conteúdo do topo")).toBeTruthy();
    expect(within(screen.getByRole("main")).getByText("conteúdo principal")).toBeTruthy();
  });

  it("mostra o nome do espaço de trabalho no cabeçalho da barra lateral", () => {
    render(<App views={registry(full)} workspaceName="Meu espaço" />);

    expect(within(screen.getByRole("complementary")).getByText("Meu espaço")).toBeTruthy();
  });

  it("um módulo só com a área principal também funciona (as outras regiões são opcionais)", () => {
    render(<App views={registry({ id: "x", title: "X", main: () => <p>só o principal</p> })} />);

    expect(screen.getByText("só o principal")).toBeTruthy();
  });

  it("sem nenhum módulo, avisa em vez de ficar em branco", () => {
    render(<App views={registry()} />);

    expect(screen.getByText("Nenhum módulo carregado.")).toBeTruthy();
  });

  it("com mais de uma tela, mostra o seletor e troca de tela", async () => {
    const second: ViewContribution = {
      id: "dois",
      title: "Segunda tela",
      main: () => <p>tela dois</p>,
    };
    render(<App views={registry(full, second)} />);
    const nav = screen.getByRole("navigation", { name: "Telas" });
    expect(
      within(nav).getByRole("button", { name: "Primeira tela" }).getAttribute("aria-current"),
    ).toBe("page");

    await userEvent.setup().click(within(nav).getByRole("button", { name: "Segunda tela" }));

    expect(screen.getByText("tela dois")).toBeTruthy();
    expect(screen.queryByText("conteúdo principal")).toBeNull();
  });

  it("com uma só tela, o seletor não aparece", () => {
    render(<App views={registry(full)} />);

    expect(screen.queryByRole("navigation", { name: "Telas" })).toBeNull();
  });

  describe("recolher a barra lateral", () => {
    it("o botão recolhe, tira a barra da ordem do Tab e mostra o botão na barra superior", async () => {
      const user = userEvent.setup();
      render(<App views={registry(full)} />);
      const shell = () => document.querySelector(".shell")!;
      expect(shell().getAttribute("data-sidebar")).toBe("open");

      await user.click(screen.getByRole("button", { name: "Fechar a barra lateral" }));

      expect(shell().getAttribute("data-sidebar")).toBe("collapsed");
      expect(document.querySelector("aside")!.hasAttribute("inert")).toBe(true);
      const reopen = within(screen.getByRole("banner")).getByRole("button", {
        name: "Abrir a barra lateral",
      });
      await user.click(reopen);
      expect(shell().getAttribute("data-sidebar")).toBe("open");
      expect(document.querySelector("aside")!.hasAttribute("inert")).toBe(false);
    });

    it("Ctrl+\\ recolhe e abre", async () => {
      const user = userEvent.setup();
      render(<App views={registry(full)} />);

      await user.keyboard("{Control>}\\{/Control}");
      expect(document.querySelector(".shell")!.getAttribute("data-sidebar")).toBe("collapsed");

      await user.keyboard("{Control>}\\{/Control}");
      expect(document.querySelector(".shell")!.getAttribute("data-sidebar")).toBe("open");
    });

    it("lembra o estado entre sessões", async () => {
      const user = userEvent.setup();
      const first = render(<App views={registry(full)} />);
      await user.click(screen.getByRole("button", { name: "Fechar a barra lateral" }));
      first.unmount();

      render(<App views={registry(full)} />);

      expect(document.querySelector(".shell")!.getAttribute("data-sidebar")).toBe("collapsed");
    });

    it("sem armazenamento disponível, o app funciona do mesmo jeito", async () => {
      const original = Object.getOwnPropertyDescriptor(window, "localStorage")!;
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new Error("bloqueado");
        },
      });
      try {
        const user = userEvent.setup();
        render(<App views={registry(full)} />);

        await user.click(screen.getByRole("button", { name: "Fechar a barra lateral" }));

        expect(document.querySelector(".shell")!.getAttribute("data-sidebar")).toBe("collapsed");
      } finally {
        Object.defineProperty(window, "localStorage", original);
      }
    });
  });
});
