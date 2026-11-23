// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { aSummary } from "../test-support.ts";
import { PageTree } from "./PageTree.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const page = (id: string, parentId: string | null = null, position = 0) =>
  aSummary({ id, title: id.toUpperCase(), parentId, position });

// A
// ├─ B
// └─ C
// D
const pages = [page("a", null, 0), page("d", null, 1), page("b", "a", 0), page("c", "a", 1)];

function renderTree(expanded: string[] = ["a"], selectedId: string | null = null) {
  const onToggle = vi.fn();
  const onSelect = vi.fn();
  render(
    <PageTree
      pages={pages}
      selectedId={selectedId}
      expanded={new Set(expanded)}
      onToggle={onToggle}
      onSelect={onSelect}
      label="Páginas"
    />,
  );
  const item = (name: string) => screen.getByRole("treeitem", { name });
  return { onToggle, onSelect, item, user: userEvent.setup() };
}

describe("árvore de páginas (teclado e acessibilidade)", () => {
  afterEach(cleanup);

  it("expõe nível, posição, tamanho e estado de cada item", () => {
    const { item } = renderTree();

    expect(item("A").getAttribute("aria-level")).toBe("1");
    expect(item("A").getAttribute("aria-expanded")).toBe("true");
    expect(item("B").getAttribute("aria-level")).toBe("2");
    expect(item("B").getAttribute("aria-posinset")).toBe("1");
    expect(item("B").getAttribute("aria-setsize")).toBe("2");
    expect(item("D").hasAttribute("aria-expanded")).toBe(false); // sem filhas: não expansível
  });

  it("só um item fica na ordem do Tab (o selecionado, ou o primeiro)", () => {
    const { item } = renderTree(["a"], "c");

    const tabbable = screen.getAllByRole("treeitem").filter((el) => el.tabIndex === 0);
    expect(tabbable).toEqual([item("C")]);
  });

  it("sem seleção, o primeiro item é o que recebe o Tab", () => {
    renderTree();

    const tabbable = screen.getAllByRole("treeitem").filter((el) => el.tabIndex === 0);
    expect(tabbable.map((el) => el.textContent)).toEqual(["▾A"]);
  });

  it("setas para baixo e para cima percorrem os itens visíveis", async () => {
    const { item, user } = renderTree();
    act(() => item("A").focus());

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(item("B"));
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(item("D"));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(item("D")); // não passa do fim
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(item("C"));
  });

  it("Home e End vão ao primeiro e ao último", async () => {
    const { item, user } = renderTree();
    act(() => item("B").focus());

    await user.keyboard("{End}");
    expect(document.activeElement).toBe(item("D"));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(item("A"));
  });

  it("seta para a direita: expande se recolhido; se já aberto, entra na primeira filha", async () => {
    const closed = renderTree([]);
    act(() => closed.item("A").focus());
    await closed.user.keyboard("{ArrowRight}");
    expect(closed.onToggle).toHaveBeenCalledWith("a");
    cleanup();

    const open = renderTree(["a"]);
    act(() => open.item("A").focus());
    await open.user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(open.item("B"));
    expect(open.onToggle).not.toHaveBeenCalled();
  });

  it("seta para a esquerda: recolhe se aberto; senão, volta para a mãe", async () => {
    const open = renderTree(["a"]);
    act(() => open.item("A").focus());
    await open.user.keyboard("{ArrowLeft}");
    expect(open.onToggle).toHaveBeenCalledWith("a");
    cleanup();

    const inChild = renderTree(["a"]);
    act(() => inChild.item("C").focus());
    await inChild.user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(inChild.item("A"));
    expect(inChild.onToggle).not.toHaveBeenCalled();
  });

  it("Enter e Espaço abrem a página; clicar também", async () => {
    const { item, onSelect, user } = renderTree();
    act(() => item("D").focus());

    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await user.click(item("B"));

    expect(onSelect.mock.calls.map((call) => call[0])).toEqual(["d", "d", "b"]);
  });

  it("combinações com Ctrl não são engolidas (os atalhos do app continuam funcionando)", async () => {
    const { item, onSelect, user } = renderTree();
    act(() => item("A").focus());
    const ctrlN = vi.fn();
    window.addEventListener("keydown", ctrlN);

    await user.keyboard("{Control>}n{/Control}");
    await user.keyboard("{Control>}{ArrowDown}{/Control}");

    window.removeEventListener("keydown", ctrlN);
    expect(ctrlN).toHaveBeenCalled();
    expect(document.activeElement).toBe(item("A")); // Ctrl+seta não moveu o foco
    expect(onSelect).not.toHaveBeenCalled();
  });
});
