// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoreIcon, Menu, type MenuItem } from "./index.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function items(onSelect = vi.fn()): MenuItem[] {
  return [
    { id: "a", label: "Mover para…", onSelect: () => onSelect("a") },
    { id: "b", label: "Desativada", disabled: true, onSelect: () => onSelect("b") },
    { id: "c", label: "Mover para a lixeira", danger: true, onSelect: () => onSelect("c") },
  ];
}

function setup(onSelect = vi.fn()) {
  const user = userEvent.setup();
  render(<Menu label="Mais ações" icon={<MoreIcon />} items={items(onSelect)} />);
  const trigger = screen.getByRole("button", { name: "Mais ações" });
  const open = () => user.click(trigger);
  const menuItem = (name: string) => screen.getByRole("menuitem", { name });
  return { user, trigger, open, menuItem, onSelect };
}

describe("Menu", () => {
  afterEach(cleanup);

  it("abre com o foco no primeiro item e expõe o estado no botão", async () => {
    const { trigger, open, menuItem } = setup();
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();

    await open();

    expect(screen.getByRole("menu", { name: "Mais ações" })).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(menuItem("Mover para…"));
  });

  it("clicar no botão de novo fecha o menu", async () => {
    const { open } = setup();
    await open();

    await open();

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("setas percorrem os itens em círculo e pulam os desativados", async () => {
    const { user, open, menuItem } = setup();
    await open();

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(menuItem("Mover para a lixeira")); // pulou a desativada
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(menuItem("Mover para…")); // voltou ao início
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(menuItem("Mover para a lixeira")); // e ao fim
  });

  it("Home e End vão ao primeiro e ao último item ativo", async () => {
    const { user, open, menuItem } = setup();
    await open();

    await user.keyboard("{End}");
    expect(document.activeElement).toBe(menuItem("Mover para a lixeira"));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(menuItem("Mover para…"));
  });

  it("Esc fecha o menu e devolve o foco ao botão", async () => {
    const { user, trigger, open } = setup();
    await open();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("Tab fecha o menu", async () => {
    const { user, open } = setup();
    await open();

    await user.keyboard("{Tab}");

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("clicar fora fecha o menu", async () => {
    const { user, open } = setup();
    await open();

    await user.click(document.body);

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("rolar a tela fecha o menu (ele é fixo e ficaria solto)", async () => {
    const { open } = setup();
    await open();

    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("escolher um item executa a ação uma vez, fecha o menu e devolve o foco ao botão", async () => {
    const { user, trigger, open, menuItem, onSelect } = setup();
    await open();

    await user.click(menuItem("Mover para a lixeira"));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith("c");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("Enter no item focado também executa a ação", async () => {
    const { user, open, onSelect } = setup();
    await open();

    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("item desativado não executa nada", async () => {
    const { user, open, menuItem, onSelect } = setup();
    await open();

    await user.click(menuItem("Desativada"));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("marca a ação destrutiva", async () => {
    const { open, menuItem } = setup();
    await open();

    expect(menuItem("Mover para a lixeira").className).toContain("ui-menu__item--danger");
    expect(menuItem("Mover para…").className).not.toContain("danger");
  });

  it("cliques e teclas do menu NÃO sobem para quem o contém (por exemplo, a linha da árvore)", async () => {
    const parentClick = vi.fn();
    const parentKey = vi.fn();
    const user = userEvent.setup();
    render(
      <div onClick={parentClick} onKeyDown={parentKey}>
        <Menu label="Mais ações" icon={<MoreIcon />} items={items()} />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Mais ações" })); // abrir
    await user.keyboard("{ArrowDown}");
    await user.click(screen.getByRole("menuitem", { name: "Mover para…" })); // escolher

    expect(parentClick).not.toHaveBeenCalled();
    expect(parentKey).not.toHaveBeenCalled();
  });
});
