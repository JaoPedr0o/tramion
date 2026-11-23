// @vitest-environment jsdom
import type { ViewContribution, ViewRegistry } from "@tramion/contracts";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  describe("seletor de telas (navegação entre Notas, Foco...)", () => {
    const withIcon: ViewContribution = {
      id: "dois",
      title: "Segunda tela",
      icon: ({ size }) => <svg data-testid="icone" width={size} height={size} />,
      main: () => <p>tela dois</p>,
    };
    const narrowScreen = (matches: boolean) =>
      vi.stubGlobal("matchMedia", (query: string) => ({ matches, media: query }));
    afterEach(() => vi.unstubAllGlobals());

    it("no computador, fica no menu lateral, com ícone quando a tela tem e a inicial quando não tem", () => {
      narrowScreen(false);
      render(<App views={registry(full, withIcon)} />);

      const nav = screen.getByRole("navigation", { name: "Telas" });
      expect(screen.getByRole("complementary", { name: "Barra lateral" }).contains(nav)).toBe(true);
      expect(within(nav).getByTestId("icone")).toBeTruthy(); // a que tem ícone
      expect(within(nav).getByText("P")).toBeTruthy(); // a que não tem: inicial de "Primeira tela"
    });

    it("no celular, vira uma barra de abas fora do menu lateral (a gaveta fica só com as páginas)", () => {
      narrowScreen(true);
      render(<App views={registry(full, withIcon)} />);

      const nav = screen.getByRole("navigation", { name: "Telas" });
      expect(screen.getByRole("complementary", { name: "Barra lateral" }).contains(nav)).toBe(
        false,
      );
      expect(nav.className).toContain("shell__tabbar");
      expect(screen.getAllByRole("navigation", { name: "Telas" })).toHaveLength(1);
    });

    it("trocar de aba no celular mostra a outra tela, mesmo com a gaveta fechada", async () => {
      narrowScreen(true);
      render(<App views={registry(full, withIcon)} />);

      await userEvent.setup().click(
        within(screen.getByRole("navigation", { name: "Telas" })).getByRole("button", {
          name: "Segunda tela",
        }),
      );

      expect(screen.getByText("tela dois")).toBeTruthy();
    });
  });

  it("com uma só tela, o seletor não aparece", () => {
    render(<App views={registry(full)} />);

    expect(screen.queryByRole("navigation", { name: "Telas" })).toBeNull();
  });

  describe("tela de celular", () => {
    const narrow = (matches: boolean) =>
      vi.stubGlobal("matchMedia", (query: string) => ({ matches, media: query }));
    afterEach(() => vi.unstubAllGlobals());
    const shell = () => document.querySelector(".shell")!;

    it("sem preferência guardada, a barra lateral começa fechada", () => {
      narrow(true);

      render(<App views={registry(full)} />);

      expect(shell().getAttribute("data-sidebar")).toBe("collapsed");
    });

    it("em tela larga, começa aberta", () => {
      narrow(false);

      render(<App views={registry(full)} />);

      expect(shell().getAttribute("data-sidebar")).toBe("open");
    });

    it("em tela de celular a gaveta começa fechada mesmo com a preferência do computador (aberta)", () => {
      narrow(true);
      localStorage.setItem("tramion.sidebarCollapsed", "0");

      render(<App views={registry(full)} />);

      expect(shell().getAttribute("data-sidebar")).toBe("collapsed");
    });

    it("abrir e fechar a gaveta no celular não muda a preferência guardada do computador", async () => {
      narrow(true);
      localStorage.setItem("tramion.sidebarCollapsed", "0");
      const user = userEvent.setup();
      render(<App views={registry(full)} />);

      await user.click(
        within(screen.getByRole("banner")).getByRole("button", { name: "Abrir a barra lateral" }),
      );

      expect(shell().getAttribute("data-sidebar")).toBe("open");
      expect(localStorage.getItem("tramion.sidebarCollapsed")).toBe("0");
    });

    it("tocar no fundo atrás da gaveta a fecha", async () => {
      narrow(true);
      const user = userEvent.setup();
      render(<App views={registry(full)} />);
      await user.click(
        within(screen.getByRole("banner")).getByRole("button", { name: "Abrir a barra lateral" }),
      );

      await user.click(document.querySelector(".shell__backdrop")!);

      expect(shell().getAttribute("data-sidebar")).toBe("collapsed");
    });

    it("escolher outra tela no seletor fecha a gaveta no celular, mas não no computador", async () => {
      const second: ViewContribution = {
        id: "dois",
        title: "Segunda tela",
        main: () => <p>tela dois</p>,
      };
      for (const [isNarrow, expected] of [
        [true, "collapsed"],
        [false, "open"],
      ] as const) {
        narrow(isNarrow);
        const user = userEvent.setup();
        render(<App views={registry(full, second)} />);
        if (isNarrow) {
          await user.click(
            within(screen.getByRole("banner")).getByRole("button", {
              name: "Abrir a barra lateral",
            }),
          );
        }
        await user.click(screen.getByRole("button", { name: "Segunda tela" }));
        expect(screen.getByText("tela dois")).toBeTruthy();
        expect(shell().getAttribute("data-sidebar")).toBe(expected);
        cleanup();
      }
    });

    it("sem a gaveta aberta, não há fundo escurecido; em tela larga também não", () => {
      narrow(false);

      render(<App views={registry(full)} />);

      expect(document.querySelector(".shell__backdrop")).toBeNull();
    });

    it("arrastar da borda esquerda abre a gaveta e arrastar para a esquerda a fecha", () => {
      narrow(true);
      render(<App views={registry(full)} />);

      const swipe = (from: number, to: number, y = 300) => {
        fireEvent.touchStart(window, { touches: [{ clientX: from, clientY: y }] });
        fireEvent.touchEnd(window, { changedTouches: [{ clientX: to, clientY: y + 4 }] });
      };

      swipe(200, 320); // longe da borda: não abre
      swipe(5, 140); // borda extrema (gesto de voltar do sistema): não abre
      expect(shell().getAttribute("data-sidebar")).toBe("collapsed");
      swipe(60, 190); // da faixa da borda: abre
      expect(shell().getAttribute("data-sidebar")).toBe("open");
      swipe(250, 120); // para a esquerda: fecha
      expect(shell().getAttribute("data-sidebar")).toBe("collapsed");
    });

    it("rolar na vertical não conta como gesto", () => {
      narrow(true);
      render(<App views={registry(full)} />);

      fireEvent.touchStart(window, { touches: [{ clientX: 10, clientY: 100 }] });
      fireEvent.touchEnd(window, { changedTouches: [{ clientX: 80, clientY: 400 }] });

      expect(shell().getAttribute("data-sidebar")).toBe("collapsed");
    });

    it("em tela larga os gestos não fazem nada", () => {
      narrow(false);
      render(<App views={registry(full)} />);

      fireEvent.touchStart(window, { touches: [{ clientX: 250, clientY: 300 }] });
      fireEvent.touchEnd(window, { changedTouches: [{ clientX: 100, clientY: 300 }] });

      expect(shell().getAttribute("data-sidebar")).toBe("open");
    });
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

  describe("aparência (tema)", () => {
    const html = () => document.documentElement;
    const chooseTheme = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
      await user.click(screen.getByRole("button", { name: "Aparência" }));
      await user.click(screen.getByRole("menuitemradio", { name }));
    };

    beforeEach(() => {
      delete html().dataset.theme;
    });

    it("o botão troca entre claro, escuro e automático, e o menu mostra o escolhido", async () => {
      const user = userEvent.setup();
      render(<App views={registry(full)} />);

      await chooseTheme(user, "Escuro");
      expect(html().dataset.theme).toBe("dark");

      await user.click(screen.getByRole("button", { name: "Aparência" }));
      expect(
        screen.getByRole("menuitemradio", { name: "Escuro" }).getAttribute("aria-checked"),
      ).toBe("true");
      await user.click(screen.getByRole("menuitemradio", { name: "Claro" }));
      expect(html().dataset.theme).toBe("light");

      await chooseTheme(user, "Automático (do sistema)");
      expect(html().hasAttribute("data-theme")).toBe(false);
    });

    it("lembra a escolha entre sessões", async () => {
      const user = userEvent.setup();
      const first = render(<App views={registry(full)} />);
      await chooseTheme(user, "Escuro");
      first.unmount();
      delete html().dataset.theme;

      render(<App views={registry(full)} />);

      expect(html().dataset.theme).toBe("dark");
    });
  });
});
