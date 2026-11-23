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

function renderTree(
  expanded: string[] = ["a"],
  selectedId: string | null = null,
  treePages = pages,
) {
  const onToggle = vi.fn();
  const onSelect = vi.fn();
  const onNewSubpage = vi.fn();
  const onDuplicate = vi.fn();
  const onExport = vi.fn();
  const onHistory = vi.fn();
  const onMove = vi.fn();
  const onToggleFavorite = vi.fn();
  const onDelete = vi.fn();
  render(
    <PageTree
      pages={treePages}
      selectedId={selectedId}
      expanded={new Set(expanded)}
      onToggle={onToggle}
      onSelect={onSelect}
      onNewSubpage={onNewSubpage}
      onDuplicate={onDuplicate}
      onExport={onExport}
      onHistory={onHistory}
      onMove={onMove}
      onToggleFavorite={onToggleFavorite}
      onDelete={onDelete}
      label="Páginas"
    />,
  );
  const item = (name: string) => screen.getByRole("treeitem", { name });
  return {
    onToggle,
    onSelect,
    onNewSubpage,
    onDuplicate,
    onExport,
    onHistory,
    onMove,
    onToggleFavorite,
    onDelete,
    item,
    user: userEvent.setup(),
  };
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
    expect(tabbable.map((el) => el.textContent)).toEqual(["A"]);
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

  describe("ações da linha (⋯ e +)", () => {
    it("o nome de cada item é só o título, sem os rótulos dos botões da linha", () => {
      const { item } = renderTree();

      expect(item("A").getAttribute("aria-label")).toBe("A");
      expect(screen.getAllByRole("treeitem").map((el) => el.getAttribute("aria-label"))).toEqual([
        "A",
        "B",
        "C",
        "D",
      ]);
    });

    it("os botões da linha ficam fora da ordem do Tab (as ações existem na barra superior)", () => {
      renderTree();

      expect(screen.getByRole("button", { name: "Mais ações de A" }).tabIndex).toBe(-1);
      expect(screen.getByRole("button", { name: "Nova subpágina em A" }).tabIndex).toBe(-1);
    });

    it("'+' cria a subpágina sem abrir a linha", async () => {
      const { user, onNewSubpage, onSelect } = renderTree();

      await user.click(screen.getByRole("button", { name: "Nova subpágina em A" }));

      expect(onNewSubpage).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("escolher um item do menu da linha age sobre aquela página e não a abre", async () => {
      const { user, onMove, onSelect } = renderTree();

      await user.click(screen.getByRole("button", { name: "Mais ações de B" }));
      await user.click(screen.getByRole("menuitem", { name: "Mover para…" }));

      expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("o menu oferece nova subpágina, duplicar, mover, favoritar e lixeira", async () => {
      const { user, onNewSubpage, onDuplicate, onToggleFavorite, onDelete } = renderTree();
      const open = () => user.click(screen.getByRole("button", { name: "Mais ações de D" }));

      await open();
      expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual([
        "Nova subpágina",
        "Duplicar",
        "Exportar como Markdown",
        "Histórico de versões",
        "Mover para…",
        "Adicionar aos favoritos",
        "Mover para a lixeira",
      ]);

      await user.click(screen.getByRole("menuitem", { name: "Nova subpágina" }));
      await open();
      await user.click(screen.getByRole("menuitem", { name: "Duplicar" }));
      await open();
      await user.click(screen.getByRole("menuitem", { name: "Adicionar aos favoritos" }));
      await open();
      await user.click(screen.getByRole("menuitem", { name: "Mover para a lixeira" }));

      expect(onNewSubpage).toHaveBeenCalledWith(expect.objectContaining({ id: "d" }));
      expect(onDuplicate).toHaveBeenCalledWith(expect.objectContaining({ id: "d" }));
      expect(onToggleFavorite).toHaveBeenCalledWith(expect.objectContaining({ id: "d" }));
      expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "d" }));
    });

    it("para uma página favoritada, o menu oferece remover dos favoritos", async () => {
      const favorite = pages.map((p) => (p.id === "d" ? { ...p, pinned: true } : p));
      const { user } = renderTree(["a"], null, favorite);

      await user.click(screen.getByRole("button", { name: "Mais ações de D" }));

      expect(screen.getByRole("menuitem", { name: "Remover dos favoritos" })).toBeTruthy();
    });

    it("teclas dentro dos botões da linha não navegam nem abrem a árvore", async () => {
      const { item, user, onNewSubpage, onSelect } = renderTree();
      act(() => screen.getByRole("button", { name: "Nova subpágina em D" }).focus());

      await user.keyboard("{Enter}"); // ativa o botão, não a linha
      await user.keyboard("{ArrowUp}"); // não pode mover o foco da árvore

      expect(onNewSubpage).toHaveBeenCalledOnce();
      expect(onSelect).not.toHaveBeenCalled();
      expect(document.activeElement).not.toBe(item("C"));
    });
  });
});
