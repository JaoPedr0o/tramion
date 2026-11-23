// @vitest-environment jsdom
import type { AppEvents } from "@aun/contracts";
import { createEventBus } from "@aun/core";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNotesService } from "../application/notes-service.ts";
import { NotesError } from "../domain/errors.ts";
import { createFakeGateway } from "../test-support.ts";
import { createNotesView } from "./NotesView.tsx";

// Diz ao React que estamos num ambiente de teste (evita avisos sobre `act`).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type User = ReturnType<typeof userEvent.setup>;

function setup() {
  const fake = createFakeGateway();
  const events = createEventBus<AppEvents>();
  const service = createNotesService({ gateway: fake.gateway, events });
  const View = createNotesView({ service, events });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
  render(<View />);
  return { fake, events, user };
}

/** Deixa passar a pausa do salvamento automático (500 ms) e as promessas pendentes. */
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });

const statusText = () => screen.getByRole("status", { name: "" }).textContent ?? "";
const tree = () => screen.getByRole("tree", { name: "Páginas" });
const treeitem = (name: string) => within(tree()).getByRole("treeitem", { name });
const levelOf = (name: string) => Number(treeitem(name).getAttribute("aria-level"));

async function newPage(user: User) {
  await user.click(await screen.findByRole("button", { name: "Nova página" }));
  return (await screen.findByLabelText("Título")) as HTMLInputElement;
}

/** Cria uma página na raiz e já a nomeia (espera o salvamento automático). */
async function newPageTitled(user: User, title: string) {
  const input = await newPage(user);
  await user.clear(input);
  await user.type(input, title);
  await settle();
}

async function newSubpage(user: User) {
  await user.click(screen.getByRole("button", { name: "Nova subpágina" }));
  return (await screen.findByLabelText("Título")) as HTMLInputElement;
}

async function rename(user: User, input: HTMLInputElement, title: string) {
  await user.clear(input);
  await user.type(input, title);
  await settle();
}

/** Cria "Pai" com a subpágina "Filha" e deixa a Filha aberta. */
async function parentWithChild(user: User) {
  await newPageTitled(user, "Pai");
  const child = await newSubpage(user);
  await rename(user, child, "Filha");
}

describe("tela de páginas", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe("criar, editar e salvar", () => {
    it("mostra o estado vazio e cria a primeira página pelo botão", async () => {
      const { user } = setup();
      expect(await screen.findByText(/Nenhuma página ainda/)).toBeTruthy();

      const title = await newPage(user);

      expect(title.value).toBe("Sem título");
      expect(await screen.findByRole("treeitem", { name: "Sem título" })).toBeTruthy();
    });

    it("salva sozinha depois da pausa e mostra 'Salvo'", async () => {
      const { user, fake } = setup();
      const title = await newPage(user);

      await user.clear(title);
      await user.type(title, "Compras");
      expect(statusText()).toContain("não salvas");
      await settle();

      expect(fake.notes.get("n1")?.title).toBe("Compras");
      expect(statusText()).toContain("Salvo");
    });

    it("título vazio não é salvo: mostra o motivo e mantém o texto na tela", async () => {
      const { user, fake } = setup();
      const title = await newPage(user);

      await user.clear(title);
      await settle();

      expect(statusText()).toContain("O título não pode ficar vazio");
      expect(fake.notes.get("n1")?.title).toBe("Sem título");
    });

    it("Ctrl+N cria uma página", async () => {
      const { user } = setup();
      await screen.findByText(/Nenhuma página ainda/);

      await user.keyboard("{Control>}n{/Control}");

      expect(await screen.findByLabelText("Título")).toBeTruthy();
    });

    it("trocar de página salva antes o que estava pendente (nada se perde)", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "Primeira");
      await newPageTitled(user, "Segunda");
      await user.click(treeitem("Primeira"));
      const title = (await screen.findByLabelText("Título")) as HTMLInputElement;
      await user.clear(title);
      await user.type(title, "Editada às pressas");

      await user.click(treeitem("Segunda")); // troca ANTES da pausa de 500 ms
      await settle();

      expect([...fake.notes.values()].map((n) => n.title)).toContain("Editada às pressas");
    });

    it("a lista se atualiza sozinha quando chega um evento de fora da tela", async () => {
      const { fake, events } = setup();
      await screen.findByText(/Nenhuma página ainda/);

      const created = await fake.gateway.create({ title: "Vinda de fora", body: "" });
      await act(async () => {
        events.emit("note.created", { id: created.id });
      });

      expect(await screen.findByRole("treeitem", { name: "Vinda de fora" })).toBeTruthy();
    });
  });

  describe("conflito de edição", () => {
    it("mantém o texto digitado, avisa, e 'manter o meu texto' salva por cima", async () => {
      const { user, fake } = setup();
      await newPage(user);
      fake.touch("n1", { body: "texto vindo de outra janela" });

      const body = screen.getByLabelText("Texto da página") as HTMLTextAreaElement;
      await user.type(body, "meu texto");
      await settle();

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("alterada em outro lugar");
      expect(body.value).toBe("meu texto"); // nada foi perdido

      await user.click(within(alert).getByRole("button", { name: "Manter o meu texto" }));
      await settle();

      expect(fake.notes.get("n1")?.body).toBe("meu texto");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(statusText()).toContain("Salvo");
    });

    it("'carregar a versão salva' troca a tela pelo texto do outro lugar", async () => {
      const { user, fake } = setup();
      await newPage(user);
      fake.touch("n1", { body: "texto vindo de outra janela" });
      const body = screen.getByLabelText("Texto da página") as HTMLTextAreaElement;
      await user.type(body, "meu texto");
      await settle();

      await user.click(await screen.findByRole("button", { name: "Carregar a versão salva" }));
      await settle();

      expect(body.value).toBe("texto vindo de outra janela");
      expect(fake.notes.get("n1")?.body).toBe("texto vindo de outra janela");
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  describe("fixar", () => {
    it("fixar e desafixar atualizam o botão e a seção 'Fixadas'", async () => {
      const { user } = setup();
      await newPage(user);
      expect(screen.queryByRole("heading", { name: "Fixadas" })).toBeNull();

      await user.click(screen.getByRole("button", { name: "Fixar" }));
      expect(await screen.findByRole("button", { name: "Desafixar" })).toBeTruthy();
      const pinned = await screen.findByRole("list", { name: "Fixadas" });
      expect(within(pinned).getByText("Sem título")).toBeTruthy();

      await user.click(screen.getByRole("button", { name: "Desafixar" }));
      expect(await screen.findByRole("button", { name: "Fixar" })).toBeTruthy();
      expect(screen.queryByRole("list", { name: "Fixadas" })).toBeNull();
    });

    it("uma subpágina fixada aparece em 'Fixadas' e continua no seu lugar na árvore", async () => {
      const { user } = setup();
      await parentWithChild(user);

      await user.click(screen.getByRole("button", { name: "Fixar" }));

      const pinned = await screen.findByRole("list", { name: "Fixadas" });
      expect(within(pinned).getByText("Filha")).toBeTruthy();
      expect(levelOf("Filha")).toBe(2);
    });
  });

  describe("subpáginas", () => {
    it("'Nova subpágina' cria dentro da página aberta, já visível e com o caminho", async () => {
      const { user } = setup();
      await newPageTitled(user, "Projetos");

      const child = await newSubpage(user);

      expect(child.value).toBe("Sem título");
      expect(levelOf("Projetos")).toBe(1);
      expect(levelOf("Sem título")).toBe(2);
      const path = screen.getByRole("navigation", { name: "Caminho" });
      expect(within(path).getByRole("button", { name: "Projetos" })).toBeTruthy();
      expect(path.textContent).toContain("Sem título");
    });

    it("clicar num item do caminho abre aquela página", async () => {
      const { user } = setup();
      await parentWithChild(user);

      await user.click(
        within(screen.getByRole("navigation", { name: "Caminho" })).getByRole("button", {
          name: "Pai",
        }),
      );

      expect(((await screen.findByLabelText("Título")) as HTMLInputElement).value).toBe("Pai");
    });

    it("Ctrl+Shift+N cria uma subpágina da página selecionada", async () => {
      const { user } = setup();
      await newPageTitled(user, "Pai");

      await user.keyboard("{Control>}{Shift>}n{/Shift}{/Control}");

      expect(await screen.findByRole("treeitem", { name: "Sem título" })).toBeTruthy();
      expect(levelOf("Sem título")).toBe(2);
    });

    it("expandir e recolher pelo teclado esconde e mostra as subpáginas", async () => {
      const { user } = setup();
      await parentWithChild(user);
      act(() => treeitem("Pai").focus());

      await user.keyboard("{ArrowLeft}");
      expect(within(tree()).queryByRole("treeitem", { name: "Filha" })).toBeNull();
      expect(treeitem("Pai").getAttribute("aria-expanded")).toBe("false");

      await user.keyboard("{ArrowRight}");
      expect(treeitem("Filha")).toBeTruthy();
      expect(treeitem("Pai").getAttribute("aria-expanded")).toBe("true");
    });
  });

  describe("mover", () => {
    it("move a página para dentro de outra pelo seletor e deixa o destino aberto", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "A");
      await newPageTitled(user, "B");

      await user.click(screen.getByRole("button", { name: "Mover para…" }));
      await user.selectOptions(
        screen.getByLabelText("Mover para"),
        screen.getByRole("option", { name: "— A" }),
      );
      await user.click(screen.getByRole("button", { name: "Mover" }));

      expect(await screen.findByRole("navigation", { name: "Caminho" })).toBeTruthy();
      expect(levelOf("A")).toBe(1);
      expect(levelOf("B")).toBe(2);
      expect(fake.notes.get("n2")?.parentId).toBe("n1");
      expect(screen.queryByRole("group", { name: "Mover página" })).toBeNull();
    });

    it("pode mover de volta para a raiz", async () => {
      const { user, fake } = setup();
      await parentWithChild(user);

      await user.click(screen.getByRole("button", { name: "Mover para…" }));
      await user.selectOptions(
        screen.getByLabelText("Mover para"),
        screen.getByRole("option", { name: "Raiz" }),
      );
      await user.click(screen.getByRole("button", { name: "Mover" }));

      await vi.waitFor(() => expect(levelOf("Filha")).toBe(1));
      expect(fake.notes.get("n2")?.parentId).toBeNull();
    });

    it("o seletor não oferece a própria página nem as suas descendentes", async () => {
      const { user } = setup();
      await newPageTitled(user, "Outra");
      await newPageTitled(user, "Pai");
      const child = await newSubpage(user);
      await rename(user, child, "Filha");
      await user.click(treeitem("Pai"));

      await user.click(await screen.findByRole("button", { name: "Mover para…" }));

      const names = within(screen.getByLabelText("Mover para"))
        .getAllByRole("option")
        .map((option) => option.textContent);
      expect(names).toEqual(["Raiz", "— Outra"]);
    });

    it("falha ao mover mostra um aviso próprio", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "A");
      vi.spyOn(fake.gateway, "move").mockRejectedValue(new NotesError("notes.cycle", "ciclo"));

      await user.click(screen.getByRole("button", { name: "Mover para…" }));
      await user.click(screen.getByRole("button", { name: "Mover" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("não pode ser movida para dentro dela mesma");
    });
  });

  describe("posição e navegação", () => {
    it("ao mover, a página vai para o fim das irmãs do destino", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "A");
      const child = await newSubpage(user);
      await rename(user, child, "C"); // C é a primeira filha de A (posição 0)
      await newPageTitled(user, "B"); // B na raiz

      await user.click(screen.getByRole("button", { name: "Mover para…" }));
      await user.selectOptions(
        screen.getByLabelText("Mover para"),
        screen.getByRole("option", { name: "— A" }),
      );
      await user.click(screen.getByRole("button", { name: "Mover" }));

      await vi.waitFor(() => expect(fake.notes.get("n3")?.parentId).toBe("n1"));
      expect(fake.notes.get("n3")?.position).toBe(1); // depois de C, que tem a posição 0
    });

    it("abrir uma página pela seção 'Fixadas' expande os ancestrais dela na árvore", async () => {
      const { user } = setup();
      await parentWithChild(user);
      await user.click(screen.getByRole("button", { name: "Fixar" })); // fixa a Filha
      act(() => treeitem("Pai").focus());
      await user.keyboard("{ArrowLeft}"); // recolhe o Pai: a Filha some da árvore
      expect(within(tree()).queryByRole("treeitem", { name: "Filha" })).toBeNull();

      const pinned = await screen.findByRole("list", { name: "Fixadas" });
      await user.click(within(pinned).getByRole("button", { name: "Filha" }));

      expect(await within(tree()).findByRole("treeitem", { name: "Filha" })).toBeTruthy();
    });
  });

  describe("lixeira", () => {
    it("excluir manda para a lixeira, de onde dá para restaurar", async () => {
      const { user } = setup();
      await newPage(user);

      await user.click(screen.getByRole("button", { name: "Excluir" }));
      expect(await screen.findByText(/Nenhuma página ainda/)).toBeTruthy();
      expect(screen.getByText("Selecione ou crie uma página.")).toBeTruthy();

      await user.click(screen.getByRole("button", { name: "Lixeira" }));
      await user.click(await screen.findByRole("button", { name: "Sem título" }));
      await user.click(await screen.findByRole("button", { name: "Restaurar" }));

      expect(await screen.findByText("A lixeira está vazia.")).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "Páginas" }));
      expect(await screen.findByRole("treeitem", { name: "Sem título" })).toBeTruthy();
    });

    it("excluir uma página leva as subpáginas junto; a lixeira mostra só a raiz com a contagem", async () => {
      const { user } = setup();
      await parentWithChild(user);
      await user.click(treeitem("Pai"));

      await user.click(await screen.findByRole("button", { name: "Excluir" }));
      expect(await screen.findByText(/Nenhuma página ainda/)).toBeTruthy(); // as duas saíram da árvore

      await user.click(screen.getByRole("button", { name: "Lixeira" }));
      const list = await screen.findByRole("list", { name: "Notas na lixeira" });
      expect(within(list).getAllByRole("button")).toHaveLength(1); // só a raiz
      expect(within(list).getByText("1 subpágina")).toBeTruthy();

      await user.click(within(list).getByRole("button", { name: /Pai/ }));
      expect(await screen.findByText(/Na lixeira \(com 1 subpágina\)/)).toBeTruthy();
    });

    it("restaurar a raiz traz a subárvore de volta com a estrutura", async () => {
      const { user } = setup();
      await parentWithChild(user);
      await user.click(treeitem("Pai"));
      await user.click(await screen.findByRole("button", { name: "Excluir" }));
      await user.click(await screen.findByRole("button", { name: "Lixeira" }));
      await user.click(await screen.findByRole("button", { name: /Pai/ }));

      await user.click(await screen.findByRole("button", { name: "Restaurar" }));
      await user.click(await screen.findByRole("button", { name: "Páginas" }));

      expect(await screen.findByRole("treeitem", { name: "Pai" })).toBeTruthy();
      expect(levelOf("Filha")).toBe(2);
    });

    it("apagar de vez exige confirmação, avisa quantas subpáginas leva e só então apaga", async () => {
      const { user, fake } = setup();
      await parentWithChild(user);
      await user.click(treeitem("Pai"));
      await user.click(await screen.findByRole("button", { name: "Excluir" }));
      await user.click(await screen.findByRole("button", { name: "Lixeira" }));
      await user.click(await screen.findByRole("button", { name: /Pai/ }));

      await user.click(await screen.findByRole("button", { name: "Apagar de vez" }));
      expect(screen.getByText(/Isto não pode ser desfeito/).textContent).toContain(
        "Também apagará 1 subpágina",
      );
      expect(fake.notes.size).toBe(2); // ainda não apagou

      await user.click(screen.getByRole("button", { name: "Confirmar" }));

      expect(await screen.findByText("A lixeira está vazia.")).toBeTruthy();
      expect(fake.notes.size).toBe(0);
    });

    it("cancelar a confirmação não apaga nada", async () => {
      const { user, fake } = setup();
      await newPage(user);
      await user.click(screen.getByRole("button", { name: "Excluir" }));
      await user.click(await screen.findByRole("button", { name: "Lixeira" }));
      await user.click(await screen.findByRole("button", { name: "Sem título" }));
      await user.click(await screen.findByRole("button", { name: "Apagar de vez" }));

      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(screen.queryByText(/Isto não pode ser desfeito/)).toBeNull();
      expect(fake.notes.has("n1")).toBe(true);
    });

    it("falha ao excluir mostra um aviso próprio, sem misturar com 'Salvo'", async () => {
      const { user, fake } = setup();
      await newPage(user);
      vi.spyOn(fake.gateway, "delete").mockRejectedValue(
        new NotesError("notes.internal", "falhou"),
      );

      await user.click(screen.getByRole("button", { name: "Excluir" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Algo deu errado");
      expect(statusText()).toBe("Salvo"); // o estado do salvamento continua correto
      expect(fake.notes.get("n1")?.deletedAt).toBeNull(); // e a página segue ativa
    });
  });
});
