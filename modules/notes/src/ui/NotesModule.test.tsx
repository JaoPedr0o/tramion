// @vitest-environment jsdom
import type { AppEvents, ViewContribution } from "@tramion/contracts";
import { createEventBus, createViewRegistry } from "@tramion/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotesPlatform } from "../application/notes-platform.ts";
import { NotesError } from "../domain/errors.ts";
import { createNotesModule } from "../module.ts";
import { StubBlockEditor } from "../test-block-editor.tsx";
import { createFakeGateway } from "../test-support.ts";

// Diz ao React que estamos num ambiente de teste (evita avisos sobre `act`).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type User = ReturnType<typeof userEvent.setup>;

/** Monta os quatro espaços da tela como o app faz: cabeçalho da lateral, lateral, barra superior e principal. */
function Frame({ view }: { view: ViewContribution }) {
  const { sidebarActions: Actions, sidebar: Sidebar, topbar: Topbar, main: Main } = view;
  return (
    <>
      <aside aria-label="Barra lateral">
        {Actions && <Actions />}
        {Sidebar && <Sidebar />}
      </aside>
      <header>{Topbar && <Topbar />}</header>
      <main>
        <Main />
      </main>
    </>
  );
}

function setup() {
  const fake = createFakeGateway();
  const events = createEventBus<AppEvents>();
  const views = createViewRegistry();
  // A "plataforma" (guardar arquivos, abrir links) e a base de emojis são falsas e pequenas nos testes.
  const platform = {
    uploadAsset: vi.fn<(file: File) => Promise<string>>(async () => "asset://localhost/abc.png"),
    openExternal: vi.fn<(url: string) => Promise<void>>(async () => {}),
    exportAll: vi.fn<NotesPlatform["exportAll"]>(async (files) => ({
      folder: "/home/u/Downloads/Tramion",
      written: files.length,
    })),
    onQuickCapture: vi.fn<NotesPlatform["onQuickCapture"]>(() => () => {}),
    notify: vi.fn<(title: string, body: string) => Promise<void>>(async () => {}),
    reportError: vi.fn<(message: string) => Promise<void>>(async () => {}),
    saveMarkdown: vi.fn<(title: string, content: string) => Promise<string>>(
      async (title) => `/home/u/Downloads/${title}.md`,
    ),
  };
  const emojis = {
    emojis: [
      { emoji: "🚀", label: "foguete", tags: ["espaço"], category: 0 },
      { emoji: "❤️", label: "coração", tags: [], category: 0 },
    ],
    categories: [{ index: 0, label: "Símbolos" }],
  };
  createNotesModule(fake.gateway, {
    BlockEditor: StubBlockEditor,
    platform,
    loadEmojiData: async () => emojis,
  }).register({ events, views });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
  render(<Frame view={views.list()[0]!} />);
  return { fake, events, user, platform };
}

/** Deixa passar a pausa do salvamento automático (500 ms) e as promessas pendentes. */
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });

const sidebar = () => within(screen.getByRole("complementary", { name: "Barra lateral" }));
const topbar = () => within(screen.getByRole("banner"));
const main = () => within(screen.getByRole("main"));
const tree = () => sidebar().getByRole("tree", { name: "Páginas" });
const treeitem = (name: string) => within(tree()).getByRole("treeitem", { name });
const levelOf = (name: string) => Number(treeitem(name).getAttribute("aria-level"));
const statusText = () => main().getByRole("status").textContent ?? "";

async function newPage(user: User) {
  await user.click(sidebar().getByRole("button", { name: "Nova página" }));
  return (await main().findByLabelText("Título")) as HTMLInputElement;
}

async function rename(user: User, input: HTMLInputElement, title: string) {
  await user.clear(input);
  await user.type(input, title);
  await settle();
}

/** Cria uma página na raiz e já a nomeia (espera o salvamento automático). */
async function newPageTitled(user: User, title: string) {
  await rename(user, await newPage(user), title);
}

async function openPageMenu(user: User, item: string) {
  await user.click(topbar().getByRole("button", { name: "Mais ações da página" }));
  await user.click(screen.getByRole("menuitem", { name: item }));
}

/** Cria "Pai" com a subpágina "Filha" (pelo menu da barra superior) e deixa a Filha aberta. */
async function parentWithChild(user: User) {
  await newPageTitled(user, "Pai");
  await openPageMenu(user, "Nova subpágina");
  await rename(user, (await main().findByLabelText("Título")) as HTMLInputElement, "Filha");
}

describe("módulo de notas (a tela inteira)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear(); // a forma de exibição das bases é lembrada: cada teste começa do zero
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe("criar, editar e salvar", () => {
    it("mostra o estado vazio e cria a primeira página pelo ícone do cabeçalho", async () => {
      const { user } = setup();
      expect(await sidebar().findByText(/Nenhuma página ainda/)).toBeTruthy();
      expect(main().getByText("Selecione ou crie uma página.")).toBeTruthy();

      const title = await newPage(user);

      expect(title.value).toBe("Sem título");
      expect(await sidebar().findByRole("treeitem", { name: "Sem título" })).toBeTruthy();
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
      await sidebar().findByText(/Nenhuma página ainda/);

      await user.keyboard("{Control>}n{/Control}");

      expect(await main().findByLabelText("Título")).toBeTruthy();
    });

    it("trocar de página salva antes o que estava pendente (nada se perde)", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "Primeira");
      await newPageTitled(user, "Segunda");
      await user.click(treeitem("Primeira"));
      const title = (await main().findByLabelText("Título")) as HTMLInputElement;
      await user.clear(title);
      await user.type(title, "Editada às pressas");

      await user.click(treeitem("Segunda")); // troca ANTES da pausa de 500 ms
      await settle();

      expect([...fake.notes.values()].map((n) => n.title)).toContain("Editada às pressas");
    });

    it("a lista se atualiza sozinha quando chega um evento de fora da tela", async () => {
      const { fake, events } = setup();
      await sidebar().findByText(/Nenhuma página ainda/);

      const created = await fake.gateway.create({ title: "Vinda de fora", body: "" });
      await act(async () => {
        events.emit("note.created", { id: created.id });
      });

      expect(await sidebar().findByRole("treeitem", { name: "Vinda de fora" })).toBeTruthy();
    });
  });

  describe("conflito de edição", () => {
    it("mantém o texto digitado, avisa, e 'manter o meu texto' salva por cima", async () => {
      const { user, fake } = setup();
      await newPage(user);
      fake.touch("n1", { body: "texto vindo de outra janela" });

      const body = main().getByLabelText("Texto da página") as HTMLTextAreaElement;
      await user.type(body, "meu texto");
      await settle();

      const alert = await main().findByRole("alert");
      expect(alert.textContent).toContain("alterada em outro lugar");
      expect(body.value).toBe("meu texto"); // nada foi perdido

      await user.click(within(alert).getByRole("button", { name: "Manter o meu texto" }));
      await settle();

      expect(fake.notes.get("n1")?.body).toBe("meu texto");
      expect(main().queryByRole("alert")).toBeNull();
      expect(statusText()).toContain("Salvo");
    });

    it("'carregar a versão salva' troca a tela pelo texto do outro lugar", async () => {
      const { user, fake } = setup();
      await newPage(user);
      fake.touch("n1", { body: "texto vindo de outra janela" });
      const body = main().getByLabelText("Texto da página") as HTMLTextAreaElement;
      await user.type(body, "meu texto");
      await settle();

      await user.click(await main().findByRole("button", { name: "Carregar a versão salva" }));
      await settle();

      // O editor recomeça com a versão salva (o campo é recriado: busca de novo).
      const reloaded = main().getByLabelText("Texto da página") as HTMLTextAreaElement;
      expect(reloaded.value).toBe("texto vindo de outra janela");
      expect(fake.notes.get("n1")?.body).toBe("texto vindo de outra janela");
      expect(main().queryByRole("alert")).toBeNull();
    });
  });

  describe("barra superior", () => {
    it("mostra o caminho, 'Editado agora' e as ações da página aberta", async () => {
      const { user } = setup();
      await newPageTitled(user, "Projetos");

      expect(topbar().getByText("Projetos")).toBeTruthy();
      expect(topbar().getByText(/^Editado /)).toBeTruthy(); // o formato exato tem testes próprios
      expect(topbar().getByRole("button", { name: "Adicionar aos favoritos" })).toBeTruthy();
      expect(topbar().getByRole("button", { name: "Mais ações da página" })).toBeTruthy();
    });

    it("sem página aberta, a barra superior fica vazia", async () => {
      setup();
      await sidebar().findByText(/Nenhuma página ainda/);

      expect(topbar().queryByRole("button")).toBeNull();
    });

    it("na lixeira, mostra o título da tela", async () => {
      const { user } = setup();
      await user.click(sidebar().getByRole("button", { name: "Lixeira" }));

      expect(await topbar().findByText("Lixeira")).toBeTruthy();
    });
  });

  describe("favoritos", () => {
    it("a estrela marca e desmarca, e a seção 'Favoritos' acompanha", async () => {
      const { user } = setup();
      await newPageTitled(user, "Importante");
      expect(sidebar().queryByRole("list", { name: "Favoritos" })).toBeNull();

      await user.click(topbar().getByRole("button", { name: "Adicionar aos favoritos" }));
      const star = await topbar().findByRole("button", { name: "Remover dos favoritos" });
      expect(star.getAttribute("aria-pressed")).toBe("true");
      const favorites = await sidebar().findByRole("list", { name: "Favoritos" });
      expect(within(favorites).getByText("Importante")).toBeTruthy();

      await user.click(star);
      expect(await topbar().findByRole("button", { name: "Adicionar aos favoritos" })).toBeTruthy();
      expect(sidebar().queryByRole("list", { name: "Favoritos" })).toBeNull();
    });

    it("uma subpágina favoritada aparece em 'Favoritos' e continua no seu lugar na árvore", async () => {
      const { user } = setup();
      await parentWithChild(user);

      await user.click(topbar().getByRole("button", { name: "Adicionar aos favoritos" }));

      const favorites = await sidebar().findByRole("list", { name: "Favoritos" });
      expect(within(favorites).getByText("Filha")).toBeTruthy();
      expect(levelOf("Filha")).toBe(2);
    });

    it("abrir uma página por 'Favoritos' expande os ancestrais dela na árvore", async () => {
      const { user } = setup();
      await parentWithChild(user);
      await user.click(topbar().getByRole("button", { name: "Adicionar aos favoritos" }));
      act(() => treeitem("Pai").focus());
      await user.keyboard("{ArrowLeft}"); // recolhe o Pai: a Filha some da árvore
      expect(within(tree()).queryByRole("treeitem", { name: "Filha" })).toBeNull();

      const favorites = await sidebar().findByRole("list", { name: "Favoritos" });
      await user.click(within(favorites).getByRole("button", { name: "Filha" }));

      expect(await within(tree()).findByRole("treeitem", { name: "Filha" })).toBeTruthy();
    });
  });

  describe("subpáginas", () => {
    it("'Nova subpágina' (menu da barra superior) cria dentro da página aberta, com o caminho", async () => {
      const { user } = setup();
      await newPageTitled(user, "Projetos");

      await openPageMenu(user, "Nova subpágina");

      expect(((await main().findByLabelText("Título")) as HTMLInputElement).value).toBe(
        "Sem título",
      );
      expect(levelOf("Projetos")).toBe(1);
      expect(levelOf("Sem título")).toBe(2);
      const path = topbar().getByRole("navigation", { name: "Caminho" });
      expect(within(path).getByRole("button", { name: "Projetos" })).toBeTruthy();
      expect(path.textContent).toContain("Sem título");
    });

    it("o '+' da linha da árvore também cria uma subpágina", async () => {
      const { user } = setup();
      await newPageTitled(user, "Pai");

      await user.click(sidebar().getByRole("button", { name: "Nova subpágina em Pai" }));

      expect(await sidebar().findByRole("treeitem", { name: "Sem título" })).toBeTruthy();
      expect(levelOf("Sem título")).toBe(2);
    });

    it("Ctrl+Shift+N cria uma subpágina da página aberta", async () => {
      const { user } = setup();
      await newPageTitled(user, "Pai");

      await user.keyboard("{Control>}{Shift>}n{/Shift}{/Control}");

      expect(await sidebar().findByRole("treeitem", { name: "Sem título" })).toBeTruthy();
      expect(levelOf("Sem título")).toBe(2);
    });

    it("clicar num item do caminho abre aquela página", async () => {
      const { user } = setup();
      await parentWithChild(user);

      await user.click(
        within(topbar().getByRole("navigation", { name: "Caminho" })).getByRole("button", {
          name: "Pai",
        }),
      );

      expect(((await main().findByLabelText("Título")) as HTMLInputElement).value).toBe("Pai");
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
    const dialog = () => screen.getByRole("dialog", { name: "Mover página" });

    it("move a página para dentro de outra pelo diálogo, deixa o destino aberto e vai para o fim", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "A");
      await openPageMenu(user, "Nova subpágina");
      await rename(user, (await main().findByLabelText("Título")) as HTMLInputElement, "C");
      await newPageTitled(user, "B");

      await openPageMenu(user, "Mover para…");
      await user.selectOptions(
        within(dialog()).getByLabelText("Mover para"),
        within(dialog()).getByRole("option", { name: "— A" }),
      );
      await user.click(within(dialog()).getByRole("button", { name: "Mover" }));

      await vi.waitFor(() => expect(fake.notes.get("n3")?.parentId).toBe("n1"));
      expect(fake.notes.get("n3")?.position).toBe(1); // depois de C, que tem a posição 0
      expect(levelOf("B")).toBe(2);
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("também move pelo menu da linha da árvore", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "A");
      await newPageTitled(user, "B");

      await user.click(sidebar().getByRole("button", { name: "Mais ações de B" }));
      await user.click(screen.getByRole("menuitem", { name: "Mover para…" }));
      await user.selectOptions(
        within(dialog()).getByLabelText("Mover para"),
        within(dialog()).getByRole("option", { name: "— A" }),
      );
      await user.click(within(dialog()).getByRole("button", { name: "Mover" }));

      await vi.waitFor(() => expect(fake.notes.get("n2")?.parentId).toBe("n1"));
    });

    it("pode mover de volta para a raiz", async () => {
      const { user, fake } = setup();
      await parentWithChild(user);

      await openPageMenu(user, "Mover para…");
      await user.selectOptions(
        within(dialog()).getByLabelText("Mover para"),
        within(dialog()).getByRole("option", { name: "Raiz" }),
      );
      await user.click(within(dialog()).getByRole("button", { name: "Mover" }));

      await vi.waitFor(() => expect(levelOf("Filha")).toBe(1));
      expect(fake.notes.get("n2")?.parentId).toBeNull();
    });

    it("o diálogo não oferece a própria página nem as suas descendentes", async () => {
      const { user } = setup();
      await newPageTitled(user, "Outra");
      await newPageTitled(user, "Pai");
      await openPageMenu(user, "Nova subpágina");
      await rename(user, (await main().findByLabelText("Título")) as HTMLInputElement, "Filha");
      await user.click(treeitem("Pai"));

      await openPageMenu(user, "Mover para…");

      const names = within(within(dialog()).getByLabelText("Mover para"))
        .getAllByRole("option")
        .map((option) => option.textContent);
      expect(names).toEqual(["Raiz", "— Outra"]);
    });

    it("Esc fecha o diálogo sem mover nada", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "A");
      await openPageMenu(user, "Mover para…");

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(fake.notes.get("n1")?.parentId).toBeNull();
    });

    it("falha ao mover mostra um aviso", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "A");
      vi.spyOn(fake.gateway, "move").mockRejectedValue(new NotesError("notes.cycle", "ciclo"));

      await openPageMenu(user, "Mover para…");
      await user.click(within(dialog()).getByRole("button", { name: "Mover" }));

      const alert = await main().findByRole("alert");
      expect(alert.textContent).toContain("não pode ser movida para dentro dela mesma");
    });
  });

  describe("lixeira", () => {
    it("mover para a lixeira tira a página da árvore; a Lixeira permite restaurar", async () => {
      const { user } = setup();
      await newPageTitled(user, "Rascunho");

      await openPageMenu(user, "Mover para a lixeira");
      expect(await sidebar().findByText(/Nenhuma página ainda/)).toBeTruthy();
      expect(main().getByText("Selecione ou crie uma página.")).toBeTruthy();

      await user.click(sidebar().getByRole("button", { name: "Lixeira" }));
      expect(await main().findByRole("heading", { name: "Lixeira" })).toBeTruthy();
      await user.click(await main().findByRole("button", { name: "Restaurar Rascunho" }));

      expect(await main().findByText("A lixeira está vazia.")).toBeTruthy();
      await user.click(sidebar().getByRole("treeitem", { name: "Rascunho" }));
      expect(await main().findByLabelText("Título")).toBeTruthy();
    });

    it("excluir leva as subpáginas junto; a lixeira mostra só a raiz com a contagem; restaurar traz tudo", async () => {
      const { user } = setup();
      await parentWithChild(user);
      await user.click(treeitem("Pai"));

      await openPageMenu(user, "Mover para a lixeira");
      expect(await sidebar().findByText(/Nenhuma página ainda/)).toBeTruthy(); // as duas saíram

      await user.click(sidebar().getByRole("button", { name: "Lixeira" }));
      const list = await main().findByRole("list", { name: "Páginas na lixeira" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(1); // só a raiz
      expect(within(list).getByText("1 subpágina")).toBeTruthy();

      await user.click(within(list).getByRole("button", { name: "Restaurar Pai" }));
      await vi.waitFor(() => expect(treeitem("Pai")).toBeTruthy());
      expect(levelOf("Filha")).toBe(2);
    });

    it("apagar de vez exige confirmação, avisa quantas subpáginas leva e só então apaga", async () => {
      const { user, fake } = setup();
      await parentWithChild(user);
      await user.click(treeitem("Pai"));
      await openPageMenu(user, "Mover para a lixeira");
      await user.click(sidebar().getByRole("button", { name: "Lixeira" }));

      await user.click(await main().findByRole("button", { name: "Apagar Pai de vez" }));
      expect(main().getByText(/Isto não pode ser desfeito/).textContent).toContain(
        "Também apagará 1 subpágina",
      );
      expect(fake.notes.size).toBe(2); // ainda não apagou

      await user.click(main().getByRole("button", { name: "Confirmar" }));

      expect(await main().findByText("A lixeira está vazia.")).toBeTruthy();
      expect(fake.notes.size).toBe(0);
    });

    it("cancelar a confirmação não apaga nada", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "Rascunho");
      await openPageMenu(user, "Mover para a lixeira");
      await user.click(sidebar().getByRole("button", { name: "Lixeira" }));
      await user.click(await main().findByRole("button", { name: "Apagar Rascunho de vez" }));

      await user.click(main().getByRole("button", { name: "Cancelar" }));

      expect(main().queryByText(/Isto não pode ser desfeito/)).toBeNull();
      expect(fake.notes.has("n1")).toBe(true);
    });

    it("esvaziar a lixeira avisa o total, só apaga o que está na lixeira e deixa as páginas ativas", async () => {
      const { user, fake } = setup();
      await parentWithChild(user); // Pai + Filha
      await user.click(treeitem("Pai"));
      await openPageMenu(user, "Mover para a lixeira");
      await newPageTitled(user, "Ativa");
      await user.click(sidebar().getByRole("button", { name: "Lixeira" }));

      await user.click(await main().findByRole("button", { name: "Esvaziar lixeira" }));
      expect(main().getByRole("alertdialog", { name: "Esvaziar a lixeira" }).textContent).toContain(
        "apagará de vez 2 páginas e não pode ser desfeito",
      );
      expect(fake.notes.size).toBe(3); // ainda não apagou

      await user.click(main().getByRole("button", { name: "Esvaziar agora" }));

      expect(await main().findByText("A lixeira está vazia.")).toBeTruthy();
      expect([...fake.notes.values()].map((n) => n.title)).toEqual(["Ativa"]);
      expect(main().queryByRole("button", { name: "Esvaziar lixeira" })).toBeNull();
    });

    it("cancelar o esvaziamento não apaga nada", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "Rascunho");
      await openPageMenu(user, "Mover para a lixeira");
      await user.click(sidebar().getByRole("button", { name: "Lixeira" }));
      await user.click(await main().findByRole("button", { name: "Esvaziar lixeira" }));

      await user.click(main().getByRole("button", { name: "Cancelar" }));

      expect(main().queryByRole("alertdialog")).toBeNull();
      expect(fake.notes.has("n1")).toBe(true);
      expect(main().getByRole("button", { name: "Esvaziar lixeira" })).toBeTruthy();
    });

    it("com a lixeira vazia não há botão de esvaziar", async () => {
      const { user } = setup();
      await user.click(sidebar().getByRole("button", { name: "Lixeira" }));

      expect(await main().findByText("A lixeira está vazia.")).toBeTruthy();
      expect(main().queryByRole("button", { name: "Esvaziar lixeira" })).toBeNull();
    });

    it("falha ao esvaziar mostra um aviso e nada é apagado", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "Rascunho");
      await openPageMenu(user, "Mover para a lixeira");
      await user.click(sidebar().getByRole("button", { name: "Lixeira" }));
      vi.spyOn(fake.gateway, "emptyTrash").mockRejectedValue(
        new NotesError("notes.internal", "falhou"),
      );

      await user.click(await main().findByRole("button", { name: "Esvaziar lixeira" }));
      await user.click(main().getByRole("button", { name: "Esvaziar agora" }));

      expect((await main().findByRole("alert")).textContent).toContain("Algo deu errado");
      expect(fake.notes.has("n1")).toBe(true);
    });

    it("falha ao excluir mostra um aviso próprio e a página segue ativa", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "Rascunho");
      vi.spyOn(fake.gateway, "delete").mockRejectedValue(
        new NotesError("notes.internal", "falhou"),
      );

      await openPageMenu(user, "Mover para a lixeira");

      const alert = await main().findByRole("alert");
      expect(alert.textContent).toContain("Algo deu errado");
      expect(statusText()).toBe("Salvo"); // o estado do salvamento não é contaminado
      expect(fake.notes.get("n1")?.deletedAt).toBeNull();
    });

    it("excluir salva antes o que estava pendente (as últimas teclas não se perdem)", async () => {
      const { user, fake } = setup();
      const title = await newPage(user);
      await user.clear(title);
      await user.type(title, "Digitado agora"); // pendente: ainda dentro da pausa de 500 ms

      await openPageMenu(user, "Mover para a lixeira");
      await settle();

      const note = fake.notes.get("n1")!;
      expect(note.deletedAt).not.toBeNull();
      expect(note.title).toBe("Digitado agora");
    });
  });

  describe("blocos e subpáginas no texto", () => {
    const textArea = () => main().getByLabelText("Texto da página") as HTMLTextAreaElement;

    it("grava os blocos e o texto simples juntos", async () => {
      const { user, fake } = setup();
      await newPage(user);

      await user.type(textArea(), "primeira linha");
      await settle();

      const note = fake.notes.get("n1")!;
      expect(note.body).toBe("primeira linha");
      const blocks = JSON.parse(note.content) as Array<{ type: string }>;
      expect(blocks).toHaveLength(1);
      expect(blocks[0]!.type).toBe("paragraph");
    });

    it("uma página antiga (só com texto) abre convertida em blocos", async () => {
      const { user, fake, events } = setup();
      const old = await fake.gateway.create({ title: "Antiga", body: "linha 1\nlinha 2" });
      await act(async () => {
        events.emit("note.created", { id: old.id });
      });

      await user.click(await sidebar().findByRole("treeitem", { name: "Antiga" }));

      expect(
        (await main().findByLabelText("Texto da página")) as HTMLTextAreaElement,
      ).toHaveProperty("value", "linha 1\nlinha 2");
    });

    it("apagar do texto o bloco de uma subpágina a manda para a lixeira", async () => {
      const { user, fake } = setup();
      await parentWithChild(user);
      await user.click(treeitem("Pai"));

      await user.click(await main().findByRole("button", { name: "Apagar o bloco de Filha" }));

      await vi.waitFor(() =>
        expect(within(tree()).queryByRole("treeitem", { name: "Filha" })).toBeNull(),
      );
      expect(fake.notes.get("n2")?.deletedAt).not.toBeNull();
    });

    it("'/Página' cria a subpágina dentro da página atual e a abre", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "Pai");

      await user.click(await main().findByRole("button", { name: "Inserir /Página" }));

      expect(await sidebar().findByRole("treeitem", { name: "Sem título" })).toBeTruthy();
      expect(levelOf("Sem título")).toBe(2);
      expect(fake.notes.get("n2")?.parentId).toBe("n1");
      expect(((await main().findByLabelText("Título")) as HTMLInputElement).value).toBe(
        "Sem título",
      );
    });
  });

  describe("ícone e capa da página", () => {
    const dialog = (name: string) => within(screen.getByRole("dialog", { name }));

    async function addIcon(user: User, search = "foguete", emoji = "foguete") {
      await user.click(main().getByRole("button", { name: "Adicionar ícone" }));
      const picker = dialog("Escolher ícone");
      await user.type(await picker.findByRole("searchbox", { name: "Buscar emoji" }), search);
      await user.click(picker.getByRole("button", { name: emoji }));
    }

    it("adiciona um ícone pela busca; ele aparece na página, na árvore e nos favoritos, sem mudar a versão", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "Projetos");
      const versionBefore = fake.notes.get("n1")!.updatedAt;

      await addIcon(user);

      await vi.waitFor(() => expect(fake.notes.get("n1")?.icon).toBe("🚀"));
      expect(main().getByRole("button", { name: "Alterar ícone" }).textContent).toBe("🚀");
      expect(treeitem("Projetos").textContent).toContain("🚀");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(fake.notes.get("n1")!.updatedAt).toBe(versionBefore); // aparência não é conteúdo

      await user.click(topbar().getByRole("button", { name: "Adicionar aos favoritos" }));
      const favorites = await sidebar().findByRole("list", { name: "Favoritos" });
      expect(favorites.textContent).toContain("🚀");
    });

    it("a busca de emojis não diferencia acentos", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "Amor");

      await addIcon(user, "CORACAO", "coração");

      await vi.waitFor(() => expect(fake.notes.get("n1")?.icon).toBe("❤️"));
    });

    it("sem busca, mostra os emojis por categoria; busca sem resultado avisa", async () => {
      const { user } = setup();
      await newPageTitled(user, "A");

      await user.click(main().getByRole("button", { name: "Adicionar ícone" }));
      const picker = dialog("Escolher ícone");
      expect(await picker.findByRole("heading", { name: "Símbolos" })).toBeTruthy();
      expect(picker.getAllByRole("button", { name: /foguete|coração/ })).toHaveLength(2);

      await user.type(picker.getByRole("searchbox", { name: "Buscar emoji" }), "zzzz");
      expect(picker.getByText("Nenhum emoji encontrado.")).toBeTruthy();
    });

    it("remove o ícone", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "A");
      await addIcon(user);
      await vi.waitFor(() => expect(fake.notes.get("n1")?.icon).toBe("🚀"));

      await user.click(main().getByRole("button", { name: "Alterar ícone" }));
      await user.click(dialog("Escolher ícone").getByRole("button", { name: "Remover ícone" }));

      await vi.waitFor(() => expect(fake.notes.get("n1")?.icon).toBeNull());
      expect(main().getByRole("button", { name: "Adicionar ícone" })).toBeTruthy();
    });

    it("Esc fecha o seletor sem mudar nada", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "A");
      await user.click(main().getByRole("button", { name: "Adicionar ícone" }));
      expect(screen.getByRole("dialog", { name: "Escolher ícone" })).toBeTruthy();

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(fake.notes.get("n1")?.icon).toBeNull();
    });

    it("escolhe a capa da galeria, mostra a faixa e permite trocar e remover", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "A");

      await user.click(main().getByRole("button", { name: "Adicionar capa" }));
      await user.click(dialog("Escolher capa").getByRole("button", { name: "Aurora" }));

      await vi.waitFor(() => expect(fake.notes.get("n1")?.cover).toBe("gradient:aurora"));
      const banner = document.querySelector<HTMLElement>(".page-cover")!;
      expect(banner.style.backgroundImage).toContain("linear-gradient");
      expect(main().queryByRole("button", { name: "Adicionar capa" })).toBeNull();

      await user.click(main().getByRole("button", { name: "Alterar capa" }));
      await user.click(dialog("Escolher capa").getByRole("button", { name: "Azul" }));
      await vi.waitFor(() => expect(fake.notes.get("n1")?.cover).toBe("color:#0b6e99"));

      await user.click(main().getByRole("button", { name: "Remover capa" }));
      await vi.waitFor(() => expect(fake.notes.get("n1")?.cover).toBeNull());
      expect(document.querySelector(".page-cover")).toBeNull();
    });

    it("capa por link: recusa endereço inválido e aceita https", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "A");
      await user.click(main().getByRole("button", { name: "Adicionar capa" }));
      const picker = dialog("Escolher capa");
      await user.click(picker.getByRole("tab", { name: "Link" }));
      const input = picker.getByRole("textbox", { name: "Endereço da imagem" });

      await user.type(input, "javascript:alert(1)");
      await user.click(picker.getByRole("button", { name: "Usar como capa" }));
      expect((await picker.findByRole("alert")).textContent).toContain(
        "não é um link http ou https válido",
      );
      expect(fake.notes.get("n1")?.cover).toBeNull();

      await user.clear(input);
      await user.type(input, "https://exemplo.com/foto.png");
      await user.click(picker.getByRole("button", { name: "Usar como capa" }));
      await vi.waitFor(() =>
        expect(fake.notes.get("n1")?.cover).toBe("image:https://exemplo.com/foto.png"),
      );
    });

    it("capa por envio de arquivo: guarda pelo sistema e usa o endereço devolvido", async () => {
      const { user, fake, platform } = setup();
      await newPageTitled(user, "A");
      await user.click(main().getByRole("button", { name: "Adicionar capa" }));
      const picker = dialog("Escolher capa");
      await user.click(picker.getByRole("tab", { name: "Enviar" }));
      const file = new File([new Uint8Array([1, 2, 3])], "foto.png", { type: "image/png" });

      await user.upload(picker.getByLabelText("Escolher imagem"), file);

      await vi.waitFor(() =>
        expect(fake.notes.get("n1")?.cover).toBe("image:asset://localhost/abc.png"),
      );
      expect(platform.uploadAsset).toHaveBeenCalledWith(file);
    });

    it("falha no envio mostra o motivo na própria janela e não muda a capa", async () => {
      const { user, fake, platform } = setup();
      platform.uploadAsset.mockRejectedValue(
        new NotesError("notes.asset-type-not-allowed", "tipo"),
      );
      await newPageTitled(user, "A");
      await user.click(main().getByRole("button", { name: "Adicionar capa" }));
      const picker = dialog("Escolher capa");
      await user.click(picker.getByRole("tab", { name: "Enviar" }));

      await user.upload(
        picker.getByLabelText("Escolher imagem"),
        new File([new Uint8Array([1])], "x.png", { type: "image/png" }),
      );

      expect((await picker.findByRole("alert")).textContent).toContain("não é aceito");
      expect(fake.notes.get("n1")?.cover).toBeNull();
    });

    it("falha ao gravar a aparência mostra um aviso na página", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "A");
      vi.spyOn(fake.gateway, "setAppearance").mockRejectedValue(
        new NotesError("notes.cover-invalid", "x"),
      );
      await user.click(main().getByRole("button", { name: "Adicionar capa" }));

      await user.click(dialog("Escolher capa").getByRole("button", { name: "Aurora" }));

      expect((await main().findByRole("alert")).textContent).toContain(
        "Esta capa não está num formato aceito",
      );
    });
  });

  describe("bases de dados", () => {
    const dialog = (name: string) => within(screen.getByRole("dialog", { name }));
    const rowTitles = () =>
      main()
        .queryAllByRole("textbox", { name: /^Título de / })
        .map((input) => (input as HTMLInputElement).value);

    async function newDatabase(user: User) {
      await user.click(sidebar().getByRole("button", { name: "Nova base de dados" }));
      return await main().findByRole("region", { name: "Base de dados" });
    }

    async function addColumn(user: User, name: string, type: string) {
      await user.click(main().getByRole("button", { name: "Adicionar coluna" }));
      const form = dialog("Adicionar coluna");
      await user.type(form.getByRole("textbox", { name: "Nome da coluna" }), name);
      await user.click(form.getByRole("button", { name: "Tipo da coluna" }));
      await user.click(screen.getByRole("option", { name: type }));
      await user.click(form.getByRole("button", { name: "Adicionar coluna" }));
      await main().findByRole("button", { name: `Coluna ${name}` });
    }

    async function addRow(user: User) {
      const before = main().queryAllByRole("textbox", { name: /^Título de / }).length;
      await user.click(main().getByRole("button", { name: "+ Nova linha" }));
      await vi.waitFor(() =>
        expect(main().getAllByRole("textbox", { name: /^Título de / })).toHaveLength(before + 1),
      );
    }

    const stored = async (fake: ReturnType<typeof setup>["fake"]) =>
      await fake.gateway.getDatabase("n1");

    it("cria uma base pela barra lateral: aparece na árvore e abre vazia", async () => {
      const { user, fake } = setup();

      await newDatabase(user);

      expect(main().getByRole("textbox", { name: "Título da base de dados" })).toHaveProperty(
        "value",
        "Nova base de dados",
      );
      expect(main().getByText("Esta base ainda não tem linhas.")).toBeTruthy();
      expect(treeitem("Nova base de dados")).toBeTruthy();
      expect((await fake.gateway.list())[0]!.isDatabase).toBe(true);
    });

    it("renomeia a base pelo título", async () => {
      const { user, fake } = setup();
      await newDatabase(user);

      const title = main().getByRole("textbox", { name: "Título da base de dados" });
      await user.clear(title);
      await user.type(title, "Tarefas{Enter}");

      await vi.waitFor(() => expect(fake.notes.get("n1")?.title).toBe("Tarefas"));
      expect(treeitem("Tarefas")).toBeTruthy();
    });

    it("adiciona coluna e linha, e a linha é uma subpágina da base", async () => {
      const { user, fake } = setup();
      await newDatabase(user);

      await addColumn(user, "Prazo", "Data");
      await addRow(user);

      expect((await stored(fake)).properties.map((p) => [p.name, p.type])).toEqual([
        ["Prazo", "date"],
      ]);
      const rowId = (await stored(fake)).rows[0]!.id;
      expect(fake.notes.get(rowId)?.parentId).toBe("n1");
      expect(rowTitles()).toEqual(["Sem título"]);
    });

    it("recusa coluna sem nome (nada é criado)", async () => {
      const { user, fake } = setup();
      await newDatabase(user);

      await user.click(main().getByRole("button", { name: "Adicionar coluna" }));
      await user.click(
        dialog("Adicionar coluna").getByRole("button", { name: "Adicionar coluna" }),
      );

      expect((await stored(fake)).properties).toHaveLength(0);
    });

    it("edita células de texto e número; texto que não é número volta ao valor anterior", async () => {
      const { user, fake } = setup();
      await newDatabase(user);
      await addColumn(user, "Obs", "Texto");
      await addColumn(user, "Qtd", "Número");
      await addRow(user);

      await user.type(main().getByRole("textbox", { name: "Obs — Sem título" }), "olá{Enter}");
      const qty = main().getByRole("textbox", { name: "Qtd — Sem título" }) as HTMLInputElement;
      await user.type(qty, "3,5{Enter}");

      await vi.waitFor(async () => {
        const row = (await stored(fake)).rows[0]!;
        expect(Object.values(row.cells)).toEqual(["olá", 3.5]);
      });

      await user.clear(qty);
      await user.type(qty, "abc{Enter}");
      expect(qty.value).toBe("3.5");
    });

    it("Esc desfaz a edição de uma célula; esvaziar apaga o valor", async () => {
      const { user, fake } = setup();
      await newDatabase(user);
      await addColumn(user, "Obs", "Texto");
      await addRow(user);
      const cell = main().getByRole("textbox", { name: "Obs — Sem título" }) as HTMLInputElement;
      await user.type(cell, "a{Enter}");
      await vi.waitFor(async () =>
        expect(Object.keys((await stored(fake)).rows[0]!.cells)).toHaveLength(1),
      );

      await user.type(cell, "bcd{Escape}");
      expect(cell.value).toBe("a");

      await user.clear(cell);
      await user.keyboard("{Enter}");
      await vi.waitFor(async () => expect((await stored(fake)).rows[0]!.cells).toEqual({}));
    });

    it("marca e desmarca a caixa", async () => {
      const { user, fake } = setup();
      await newDatabase(user);
      await addColumn(user, "Feito", "Caixa de seleção");
      await addRow(user);

      await user.click(main().getByRole("checkbox", { name: "Feito — Sem título" }));
      await vi.waitFor(async () =>
        expect(Object.values((await stored(fake)).rows[0]!.cells)).toEqual([true]),
      );

      await user.click(main().getByRole("checkbox", { name: "Feito — Sem título" }));
      await vi.waitFor(async () =>
        expect(Object.values((await stored(fake)).rows[0]!.cells)).toEqual([false]),
      );
    });

    it("escolhe a data", async () => {
      const { user, fake } = setup();
      await newDatabase(user);
      await addColumn(user, "Prazo", "Data");
      await addRow(user);

      await user.type(main().getByLabelText("Prazo — Sem título"), "2024-05-17");

      await vi.waitFor(async () =>
        expect(Object.values((await stored(fake)).rows[0]!.cells)).toEqual(["2024-05-17"]),
      );
    });

    it("seleção: cria opções na hora, escolhe uma e mostra a etiqueta", async () => {
      const { user, fake } = setup();
      await newDatabase(user);
      await addColumn(user, "Status", "Seleção");
      await addRow(user);

      await user.click(main().getByRole("button", { name: "Status — Sem título" }));
      const list = dialog("Opções de Status");
      await user.type(list.getByRole("textbox", { name: "Nome da nova opção" }), "A fazer{Enter}");

      await vi.waitFor(async () => {
        const data = await stored(fake);
        expect(data.properties[0]!.options.map((o) => o.name)).toEqual(["A fazer"]);
        expect(Object.values(data.rows[0]!.cells)).toEqual([data.properties[0]!.options[0]!.id]);
      });
      expect(
        within(main().getByRole("button", { name: "Status — Sem título" })).getByText("A fazer"),
      ).toBeTruthy();
    });

    it("seleção múltipla: marca várias, desmarca e remover a opção limpa as linhas", async () => {
      const { user, fake } = setup();
      await newDatabase(user);
      await addColumn(user, "Tags", "Seleção múltipla");
      await addRow(user);
      await user.click(main().getByRole("button", { name: "Tags — Sem título" }));
      const list = dialog("Opções de Tags");
      await user.type(list.getByRole("textbox", { name: "Nome da nova opção" }), "Casa{Enter}");
      await vi.waitFor(async () =>
        expect((await stored(fake)).properties[0]!.options).toHaveLength(1),
      );
      await user.type(list.getByRole("textbox", { name: "Nome da nova opção" }), "Urgente{Enter}");
      await vi.waitFor(async () =>
        expect(Object.values((await stored(fake)).rows[0]!.cells)[0]).toHaveLength(2),
      );

      await user.click(list.getByRole("checkbox", { name: "Casa" }));
      await vi.waitFor(async () =>
        expect(Object.values((await stored(fake)).rows[0]!.cells)[0]).toHaveLength(1),
      );

      await user.keyboard("{Escape}");
      await user.click(main().getByRole("button", { name: "Coluna Tags" }));
      await user.click(
        dialog("Coluna Tags").getByRole("button", { name: "Remover a opção Urgente" }),
      );
      await vi.waitFor(async () => expect((await stored(fake)).rows[0]!.cells).toEqual({}));
    });

    it("renomeia a linha pelo título e mostra o novo nome na árvore da lateral", async () => {
      const { user, fake } = setup();
      await newDatabase(user);
      await addRow(user);

      const title = main().getByRole("textbox", { name: "Título de Sem título" });
      await user.clear(title);
      await user.type(title, "Comprar pão{Enter}");

      const rowId = (await stored(fake)).rows[0]!.id;
      await vi.waitFor(() => expect(fake.notes.get(rowId)?.title).toBe("Comprar pão"));
      expect(rowTitles()).toEqual(["Comprar pão"]);
    });

    it("título vazio volta ao anterior e nada é gravado", async () => {
      const { user, fake } = setup();
      await newDatabase(user);
      await addRow(user);
      const rowId = (await stored(fake)).rows[0]!.id;
      const before = fake.notes.get(rowId)!.updatedAt;

      const title = main().getByRole("textbox", {
        name: "Título de Sem título",
      }) as HTMLInputElement;
      await user.clear(title);
      await user.keyboard("{Enter}");

      expect(title.value).toBe("Sem título");
      expect(fake.notes.get(rowId)!.updatedAt).toBe(before);
    });

    it("filtra por título e por coluna, combina regras e avisa quando nada passa", async () => {
      const { user } = setup();
      await newDatabase(user);
      await addColumn(user, "Feito", "Caixa de seleção");
      for (const name of ["Pão", "Leite"]) {
        await addRow(user);
        const inputs = main().getAllByRole("textbox", {
          name: /^Título de /,
        }) as HTMLInputElement[];
        const last = inputs[inputs.length - 1]!;
        await user.clear(last);
        await user.type(last, `${name}{Enter}`);
        await vi.waitFor(() => expect(rowTitles()).toContain(name));
      }
      await user.click(main().getByRole("checkbox", { name: "Feito — Pão" }));

      await user.click(main().getByRole("button", { name: "Filtrar" }));
      const panel = dialog("Filtrar");
      await user.click(panel.getByRole("button", { name: "Adicionar filtro" }));
      await user.type(panel.getByRole("textbox", { name: "Valor do filtro 1" }), "le");
      expect(rowTitles()).toEqual(["Leite"]);

      await user.click(panel.getByRole("button", { name: "Adicionar filtro" }));
      await user.click(panel.getByRole("button", { name: "Coluna do filtro 2" }));
      await user.click(screen.getByRole("option", { name: "Feito" }));
      expect(rowTitles()).toEqual([]); // "le" E marcado: ninguém
      expect(main().getByText("Nenhuma linha passa nos filtros.")).toBeTruthy();

      await user.click(panel.getByRole("button", { name: "Remover o filtro 1" }));
      expect(rowTitles()).toEqual(["Pão"]); // só "marcado"
      expect(main().getByRole("button", { name: "Filtrar" }).textContent).toBe("Filtrar (1)");
    });

    it("ordena por título, crescente e decrescente, e limpa", async () => {
      const { user } = setup();
      await newDatabase(user);
      for (const name of ["Banana", "Abacate", "Caju"]) {
        await addRow(user);
        const inputs = main().getAllByRole("textbox", {
          name: /^Título de /,
        }) as HTMLInputElement[];
        const last = inputs[inputs.length - 1]!;
        await user.clear(last);
        await user.type(last, `${name}{Enter}`);
        await vi.waitFor(() => expect(rowTitles()).toContain(name));
      }

      await user.click(main().getByRole("button", { name: "Ordenar" }));
      const panel = dialog("Ordenar");
      await user.click(panel.getByRole("button", { name: "Ordenar por" }));
      await user.click(screen.getByRole("option", { name: "Título" }));
      expect(rowTitles()).toEqual(["Abacate", "Banana", "Caju"]);

      await user.click(panel.getByRole("button", { name: "Direção da ordenação" }));
      await user.click(screen.getByRole("option", { name: "Decrescente" }));
      expect(rowTitles()).toEqual(["Caju", "Banana", "Abacate"]);

      await user.click(panel.getByRole("button", { name: "Limpar ordenação" }));
      expect(rowTitles()).toEqual(["Banana", "Abacate", "Caju"]);
    });

    it("renomeia e exclui coluna; as linhas continuam", async () => {
      const { user, fake } = setup();
      await newDatabase(user);
      await addColumn(user, "Obs", "Texto");
      await addRow(user);

      await user.click(main().getByRole("button", { name: "Coluna Obs" }));
      const settings = dialog("Coluna Obs");
      const name = settings.getByRole("textbox", { name: "Renomear coluna" });
      await user.clear(name);
      await user.type(name, "Notas{Enter}");
      await vi.waitFor(async () => expect((await stored(fake)).properties[0]!.name).toBe("Notas"));

      // A janela da coluna continua aberta depois de renomear (agora com o novo nome).
      await user.click(
        await dialog("Coluna Notas").findByRole("button", { name: "Excluir coluna" }),
      );
      await vi.waitFor(async () => expect((await stored(fake)).properties).toEqual([]));
      expect(main().queryByRole("button", { name: /^Coluna / })).toBeNull();
      expect(rowTitles()).toEqual(["Sem título"]);
    });

    it("exclui uma linha (vai para a lixeira) e a tabela se atualiza", async () => {
      const { user, fake } = setup();
      await newDatabase(user);
      await addRow(user);

      await user.click(main().getByRole("button", { name: "Excluir Sem título" }));

      const rowId = [...fake.notes.values()].find((n) => n.parentId === "n1")!.id;
      await vi.waitFor(() => expect(fake.notes.get(rowId)?.deletedAt).toBeTypeOf("number"));
      await vi.waitFor(() =>
        expect(main().getByText("Esta base ainda não tem linhas.")).toBeTruthy(),
      );
    });

    it("abre a linha como página (com editor) ao clicar no ícone", async () => {
      const { user } = setup();
      await newDatabase(user);
      await addRow(user);

      await user.click(main().getByRole("button", { name: "Abrir Sem título" }));

      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty(
        "value",
        "Sem título",
      );
      expect(main().queryByRole("region", { name: "Base de dados" })).toBeNull();
    });

    it("falha ao gravar uma célula mostra o motivo na tela", async () => {
      const { user, fake } = setup();
      await newDatabase(user);
      await addColumn(user, "Obs", "Texto");
      await addRow(user);
      vi.spyOn(fake.gateway, "setCell").mockRejectedValue(
        new NotesError("notes.cell-invalid", "x"),
      );

      await user.type(main().getByRole("textbox", { name: "Obs — Sem título" }), "a{Enter}");

      expect((await main().findByRole("alert")).textContent).toContain(
        "Este valor não serve para esta coluna",
      );
    });

    type Fake = ReturnType<typeof setup>["fake"];

    /** Base com coluna de seleção "Status" (opções "A fazer" e "Feito") e uma linha, que termina em "Feito". */
    async function boardBase(user: User, fake: Fake) {
      await newDatabase(user);
      await addColumn(user, "Status", "Seleção");
      await addRow(user);
      const optionsOf = async () => (await fake.gateway.getDatabase("n1")).properties[0]!.options;
      for (const [index, name] of ["A fazer", "Feito"].entries()) {
        await user.click(main().getByRole("button", { name: "Status — Sem título" }));
        await user.type(
          dialog("Opções de Status").getByRole("textbox", { name: "Nome da nova opção" }),
          `${name}{Enter}`,
        );
        await vi.waitFor(async () => expect(await optionsOf()).toHaveLength(index + 1));
      }
    }
    const optionId = async (fake: Fake, name: string) =>
      (await fake.gateway.getDatabase("n1")).properties[0]!.options.find((o) => o.name === name)!
        .id;
    const cellsOfFirstRow = async (fake: Fake) =>
      Object.values((await fake.gateway.getDatabase("n1")).rows[0]!.cells);
    const column = (name: string) => within(main().getByRole("region", { name }));
    /** Abre a visão com esse nome; se ela ainda não existe, cria uma visão nova com essa forma de exibição. */
    const showMode = async (user: User, label: string) => {
      const existing = main().queryByRole("tab", { name: label });
      if (existing) return await user.click(existing);
      await user.click(main().getByRole("button", { name: "Nova visão" }));
      await user.click(
        within(screen.getByRole("dialog", { name: "Nova visão" })).getByRole("button", {
          name: label,
        }),
      );
      await main().findByRole("tab", { name: label, selected: true });
    };
    const showBoard = (user: User) => showMode(user, "Quadro");

    it("sem coluna de seleção, o quadro explica o que falta", async () => {
      const { user } = setup();
      await newDatabase(user);

      await showBoard(user);

      expect(main().getByText(/adicione uma coluna do tipo Seleção/)).toBeTruthy();
    });

    it("quadro: uma coluna por opção, 'Sem valor', e o cartão na coluna do valor dele", async () => {
      const { user, fake } = setup();
      await boardBase(user, fake);

      await showBoard(user);

      expect(main().getByRole("group", { name: "Quadro por Status" })).toBeTruthy();
      expect(main().getByRole("region", { name: "A fazer" })).toBeTruthy();
      expect(main().getByRole("region", { name: "Sem valor" })).toBeTruthy();
      expect(column("Feito").getByText("Sem título")).toBeTruthy();
      expect(column("A fazer").queryByText("Sem título")).toBeNull();
    });

    it("quadro: mover o cartão pelo seletor troca o valor da célula e esvaziar tira do valor", async () => {
      const { user, fake } = setup();
      await boardBase(user, fake);
      await showBoard(user);

      await user.click(main().getByRole("button", { name: "Mover Sem título para" }));
      await user.click(screen.getByRole("option", { name: "A fazer" }));

      await vi.waitFor(async () =>
        expect(await cellsOfFirstRow(fake)).toEqual([await optionId(fake, "A fazer")]),
      );
      expect(column("A fazer").getByText("Sem título")).toBeTruthy();

      await user.click(main().getByRole("button", { name: "Mover Sem título para" }));
      await user.click(screen.getByRole("option", { name: "Sem valor" }));
      await vi.waitFor(async () => expect(await cellsOfFirstRow(fake)).toEqual([]));
      expect(column("Sem valor").getByText("Sem título")).toBeTruthy();
    });

    it("quadro: arrastar o cartão para outra coluna muda o valor", async () => {
      const { user, fake } = setup();
      await boardBase(user, fake);
      await showBoard(user);
      const card = main().getByText("Sem título").closest("li")!;
      const dataTransfer = { setData: vi.fn(), effectAllowed: "" };

      act(() => {
        card.dispatchEvent(
          Object.assign(new Event("dragstart", { bubbles: true }), { dataTransfer }),
        );
      });
      const target = main().getByRole("region", { name: "A fazer" });
      act(() => {
        target.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
        target.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
      });

      await vi.waitFor(async () =>
        expect(await cellsOfFirstRow(fake)).toEqual([await optionId(fake, "A fazer")]),
      );
    });

    it("quadro: '+ Novo' cria o cartão já na coluna", async () => {
      const { user, fake } = setup();
      await boardBase(user, fake);
      await showBoard(user);

      await user.click(main().getByRole("button", { name: "Novo cartão em A fazer" }));

      await vi.waitFor(async () => {
        const data = await fake.gateway.getDatabase("n1");
        expect(data.rows).toHaveLength(2);
        expect(Object.values(data.rows[1]!.cells)).toEqual([await optionId(fake, "A fazer")]);
      });
      expect(column("A fazer").getByText("Sem título")).toBeTruthy();
    });

    it("quadro: respeita o filtro e abre o cartão como página", async () => {
      const { user, fake } = setup();
      await boardBase(user, fake);
      await showBoard(user);

      await user.click(main().getByRole("button", { name: "Filtrar" }));
      const panel = dialog("Filtrar");
      await user.click(panel.getByRole("button", { name: "Adicionar filtro" }));
      await user.type(panel.getByRole("textbox", { name: "Valor do filtro 1" }), "zzz");
      expect(main().queryByText("Sem título")).toBeNull();

      await user.clear(panel.getByRole("textbox", { name: "Valor do filtro 1" }));
      await user.keyboard("{Escape}");
      await user.click(main().getByRole("button", { name: "Sem título" }));
      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty(
        "value",
        "Sem título",
      );
    });

    /** Base com colunas "Obs" (texto) e "Prazo" (data) e duas linhas: "Pão" (dia 5) e "Leite" (sem data). */
    async function datedBase(user: User, fake: Fake, today = new Date(2026, 10, 15)) {
      vi.setSystemTime(today);
      await newDatabase(user);
      await addColumn(user, "Prazo", "Data");
      await addColumn(user, "Obs", "Texto");
      for (const title of ["Pão", "Leite"]) {
        await addRow(user);
        const inputs = main().getAllByRole("textbox", {
          name: /^Título de /,
        }) as HTMLInputElement[];
        const last = inputs[inputs.length - 1]!;
        await user.clear(last);
        await user.type(last, `${title}{Enter}`);
        await vi.waitFor(() => expect(rowTitles()).toContain(title));
      }
      await user.type(main().getByLabelText("Prazo — Pão"), "2026-11-05");
      await user.type(main().getByRole("textbox", { name: "Obs — Pão" }), "integral{Enter}");
      await vi.waitFor(async () => {
        const data = await fake.gateway.getDatabase("n1");
        expect(Object.values(data.rows[0]!.cells)).toHaveLength(2);
      });
    }
    const showView = (user: User, name: string) => showMode(user, name);
    const rowDate = async (fake: Fake, title: string) => {
      const data = await fake.gateway.getDatabase("n1");
      const date = data.properties.find((p) => p.type === "date")!;
      return data.rows.find((r) => r.title === title)?.cells[date.id];
    };

    it("lista: uma linha por página com os valores preenchidos; abre a página ao clicar", async () => {
      const { user, fake } = setup();
      await datedBase(user, fake);

      await showView(user, "Lista");

      const list = main().getByRole("list", { name: "Lista" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(2);
      expect(within(list).getByText("integral")).toBeTruthy();
      expect(within(list).getByText("2026-11-05")).toBeTruthy();
      await user.click(within(list).getByRole("button", { name: "Pão" }));
      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty("value", "Pão");
    });

    it("lista e galeria respeitam o filtro e criam linhas pelo botão de nova linha", async () => {
      const { user, fake } = setup();
      await datedBase(user, fake);
      await showView(user, "Lista");
      await user.click(main().getByRole("button", { name: "Filtrar" }));
      const panel = dialog("Filtrar");
      await user.click(panel.getByRole("button", { name: "Adicionar filtro" }));
      await user.type(panel.getByRole("textbox", { name: "Valor do filtro 1" }), "leite");
      expect(
        within(main().getByRole("list", { name: "Lista" })).getAllByRole("listitem"),
      ).toHaveLength(1);
      await user.keyboard("{Escape}");

      await showView(user, "Galeria");
      expect(
        within(main().getByRole("list", { name: "Galeria" })).getAllByRole("listitem").length,
      ).toBeGreaterThan(0);
      expect(main().getByText("integral")).toBeTruthy(); // a galeria é outra visão: não herda o filtro da lista

      await user.click(main().getByRole("button", { name: "+ Nova linha" }));
      await vi.waitFor(async () =>
        expect((await fake.gateway.getDatabase("n1")).rows).toHaveLength(3),
      );
    });

    it("galeria: cartões com título e valores; abrir leva à página", async () => {
      const { user, fake } = setup();
      await datedBase(user, fake);

      await showView(user, "Galeria");

      const gallery = main().getByRole("list", { name: "Galeria" });
      expect(within(gallery).getByText("integral")).toBeTruthy();
      await user.click(within(gallery).getByRole("button", { name: "Leite" }));
      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty(
        "value",
        "Leite",
      );
    });

    it("calendário: mostra o mês de hoje, a linha no dia dela e as sem data à parte", async () => {
      const { user, fake } = setup();
      await datedBase(user, fake);

      await showView(user, "Calendário");

      expect(main().getByRole("heading", { name: "novembro de 2026" })).toBeTruthy();
      const day = within(main().getByRole("cell", { name: "5 de novembro de 2026" }));
      expect(day.getByRole("button", { name: "Pão" })).toBeTruthy();
      const undated = within(main().getByRole("region", { name: "Sem data" }));
      expect(undated.getByRole("button", { name: "Leite" })).toBeTruthy();
      expect(main().getAllByRole("columnheader")).toHaveLength(7);
    });

    it("calendário: navega entre os meses e volta para hoje", async () => {
      const { user, fake } = setup();
      await datedBase(user, fake);
      await showView(user, "Calendário");

      await user.click(main().getByRole("button", { name: "Próximo mês" }));
      expect(main().getByRole("heading", { name: "dezembro de 2026" })).toBeTruthy();
      expect(main().queryByRole("button", { name: "Pão" })).toBeNull();

      await user.click(main().getByRole("button", { name: "Próximo mês" }));
      expect(main().getByRole("heading", { name: "janeiro de 2027" })).toBeTruthy();

      await user.click(main().getByRole("button", { name: "Mês anterior" }));
      await user.click(main().getByRole("button", { name: "Mês anterior" }));
      await user.click(main().getByRole("button", { name: "Mês anterior" }));
      expect(main().getByRole("heading", { name: "outubro de 2026" })).toBeTruthy();

      await user.click(main().getByRole("button", { name: "Hoje" }));
      expect(main().getByRole("heading", { name: "novembro de 2026" })).toBeTruthy();
    });

    it("calendário: '+' cria a linha já com a data do dia", async () => {
      const { user, fake } = setup();
      await datedBase(user, fake);
      await showView(user, "Calendário");

      await user.click(main().getByRole("button", { name: "Novo item em 20 de novembro de 2026" }));

      await vi.waitFor(async () => {
        const data = await fake.gateway.getDatabase("n1");
        expect(data.rows).toHaveLength(3);
      });
      const created = (await fake.gateway.getDatabase("n1")).rows[2]!;
      expect(Object.values(created.cells)).toEqual(["2026-11-20"]);
      expect(
        within(main().getByRole("cell", { name: "20 de novembro de 2026" })).getByRole("button", {
          name: "Sem título",
        }),
      ).toBeTruthy();
    });

    it("calendário: arrastar para outro dia muda a data; sem data entra no dia solto", async () => {
      const { user, fake } = setup();
      await datedBase(user, fake);
      await showView(user, "Calendário");
      const drag = (title: string, dayLabel: string) => {
        const card = main().getByRole("button", { name: title }).closest("li")!;
        act(() => {
          card.dispatchEvent(
            Object.assign(new Event("dragstart", { bubbles: true }), {
              dataTransfer: { setData: vi.fn(), effectAllowed: "" },
            }),
          );
        });
        const target = main().getByRole("cell", { name: dayLabel });
        act(() => {
          target.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
          target.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
        });
      };

      drag("Pão", "12 de novembro de 2026");
      await vi.waitFor(async () => expect(await rowDate(fake, "Pão")).toBe("2026-11-12"));

      drag("Leite", "3 de novembro de 2026");
      await vi.waitFor(async () => expect(await rowDate(fake, "Leite")).toBe("2026-11-03"));
      await vi.waitFor(() => expect(main().queryByRole("region", { name: "Sem data" })).toBeNull());
    });

    it("calendário: o seletor 'Mudar a data' define e tira a data (alternativa ao arrastar)", async () => {
      const { user, fake } = setup();
      await datedBase(user, fake);
      await showView(user, "Calendário");

      await user.click(main().getByRole("button", { name: "Mudar a data de Pão" }));
      fireEvent.change(screen.getByLabelText("Nova data"), { target: { value: "2026-11-09" } });
      await vi.waitFor(async () => expect(await rowDate(fake, "Pão")).toBe("2026-11-09"));
      // Espera a tela mostrar a linha no dia novo antes de continuar (senão o clique cai no item que vai sumir).
      await vi.waitFor(() =>
        expect(
          within(main().getByRole("cell", { name: "9 de novembro de 2026" })).getByRole("button", {
            name: "Pão",
          }),
        ).toBeTruthy(),
      );

      await user.click(main().getByRole("button", { name: "Mudar a data de Pão" }));
      await user.click(screen.getByRole("button", { name: "Tirar a data" }));
      await vi.waitFor(async () => expect(await rowDate(fake, "Pão")).toBeUndefined());
      expect(
        within(main().getByRole("region", { name: "Sem data" })).getByRole("button", {
          name: "Pão",
        }),
      ).toBeTruthy();
    });

    it("calendário: sem coluna de data explica o que falta; com duas, escolhe qual mostrar", async () => {
      const { user, fake } = setup();
      await newDatabase(user);
      await showView(user, "Calendário");
      expect(main().getByText(/adicione uma coluna do tipo Data/)).toBeTruthy();

      await showView(user, "Tabela");
      await addColumn(user, "Início", "Data");
      await addColumn(user, "Fim", "Data");
      await showView(user, "Calendário");

      await user.click(main().getByRole("button", { name: "Mostrar por" }));
      await user.click(screen.getByRole("option", { name: "Fim" }));
      expect(main().getByRole("button", { name: "Mostrar por" }).textContent).toBe("Fim");
      expect((await fake.gateway.getDatabase("n1")).properties).toHaveLength(2);
    });

    it("volta para a tabela", async () => {
      const { user } = setup();
      await newDatabase(user);
      await showBoard(user);

      await user.click(main().getByRole("tab", { name: "Tabela" }));

      expect(main().getByRole("table", { name: "Linhas da base" })).toBeTruthy();
    });

    const savedViews = async (fake: Fake) => (await fake.gateway.getDatabase("n1")).views;

    it("toda base nasce com a visão Tabela; '+' cria visões com nome livre (Quadro, Quadro 2)", async () => {
      const { user, fake } = setup();
      await newDatabase(user);

      expect(main().getByRole("tab", { name: "Tabela", selected: true })).toBeTruthy();

      await user.click(main().getByRole("button", { name: "Nova visão" }));
      await user.click(
        within(screen.getByRole("dialog", { name: "Nova visão" })).getByRole("button", {
          name: "Quadro",
        }),
      );
      await user.click(main().getByRole("button", { name: "Nova visão" }));
      await user.click(
        within(screen.getByRole("dialog", { name: "Nova visão" })).getByRole("button", {
          name: "Quadro",
        }),
      );

      expect(
        main()
          .getAllByRole("tab")
          .map((tab) => tab.textContent),
      ).toEqual(["Tabela", "Quadro", "Quadro 2"]);
      expect((await savedViews(fake)).map((v) => v.config.mode)).toEqual([
        "table",
        "board",
        "board",
      ]);
    });

    it("filtros e ordenação ficam em cada visão: trocar de visão não mistura e tudo é salvo", async () => {
      const { user, fake } = setup();
      await newDatabase(user);
      for (const title of ["Pão", "Leite"]) {
        await addRow(user);
        const inputs = main().getAllByRole("textbox", {
          name: /^Título de /,
        }) as HTMLInputElement[];
        const last = inputs[inputs.length - 1]!;
        await user.clear(last);
        await user.type(last, `${title}{Enter}`);
        await vi.waitFor(() => expect(rowTitles()).toContain(title));
      }
      await user.click(main().getByRole("button", { name: "Filtrar" }));
      const panel = dialog("Filtrar");
      await user.click(panel.getByRole("button", { name: "Adicionar filtro" }));
      await user.type(panel.getByRole("textbox", { name: "Valor do filtro 1" }), "leite");
      await user.keyboard("{Escape}");
      expect(rowTitles()).toEqual(["Leite"]);

      await showMode(user, "Lista"); // visão nova: sem filtros
      expect(
        within(main().getByRole("list", { name: "Lista" })).getAllByRole("listitem"),
      ).toHaveLength(2);

      await showMode(user, "Tabela"); // a primeira visão continua filtrada
      expect(rowTitles()).toEqual(["Leite"]);
      expect(main().getByRole("button", { name: "Filtrar" }).textContent).toBe("Filtrar (1)");

      await settle(); // a gravação espera uma pausa
      const views = await savedViews(fake);
      expect(views[0]!.config.filters).toEqual([
        { property: "title", operator: "contains", value: "leite" },
      ]);
      expect(views[1]!.config.filters).toEqual([]);
    });

    it("a ordenação também é salva na visão", async () => {
      const { user, fake } = setup();
      await newDatabase(user);

      await user.click(main().getByRole("button", { name: "Ordenar" }));
      const panel = dialog("Ordenar");
      await user.click(panel.getByRole("button", { name: "Ordenar por" }));
      await user.click(screen.getByRole("option", { name: "Título" }));
      await user.click(panel.getByRole("button", { name: "Direção da ordenação" }));
      await user.click(screen.getByRole("option", { name: "Decrescente" }));
      await settle();

      expect((await savedViews(fake))[0]!.config.sort).toEqual({
        property: "title",
        direction: "desc",
      });
    });

    it("renomear, mudar a forma de exibição e duplicar a visão", async () => {
      const { user, fake } = setup();
      await newDatabase(user);

      await user.click(main().getByRole("button", { name: "Opções da visão" }));
      const options = dialog("Opções da visão");
      const name = options.getByRole("textbox", { name: "Nome da visão" });
      await user.clear(name);
      await user.type(name, "Minhas tarefas{Enter}");
      await main().findByRole("tab", { name: "Minhas tarefas" });

      await user.click(options.getByRole("button", { name: "Exibir como" }));
      await user.click(screen.getByRole("option", { name: "Galeria" }));
      expect(main().getByRole("list", { name: "Galeria" })).toBeTruthy();

      await user.click(options.getByRole("button", { name: "Duplicar visão" }));
      await main().findByRole("tab", { name: "Minhas tarefas (cópia)", selected: true });
      await settle();
      const views = await savedViews(fake);
      expect(views.map((v) => [v.name, v.config.mode])).toEqual([
        ["Minhas tarefas", "gallery"],
        ["Minhas tarefas (cópia)", "gallery"],
      ]);
    });

    it("exclui uma visão, mas nunca a última", async () => {
      const { user, fake } = setup();
      await newDatabase(user);
      await showMode(user, "Lista");

      await user.click(main().getByRole("button", { name: "Opções da visão" }));
      await user.click(dialog("Opções da visão").getByRole("button", { name: "Excluir visão" }));

      await vi.waitFor(async () => expect(await savedViews(fake)).toHaveLength(1));
      expect(main().getByRole("tab", { name: "Tabela", selected: true })).toBeTruthy();
      expect(main().queryByRole("tab", { name: "Lista" })).toBeNull();

      await user.click(main().getByRole("button", { name: "Opções da visão" }));
      expect(
        dialog("Opções da visão")
          .getByRole("button", { name: "Excluir visão" })
          .hasAttribute("disabled"),
      ).toBe(true);
    });

    it("calendário em semana: título, navegação por semana e escala salva na visão", async () => {
      const { user, fake } = setup();
      await datedBase(user, fake); // hoje = domingo, 15 de novembro de 2026
      await showView(user, "Calendário");

      await user.click(main().getByRole("tab", { name: "Semana" }));
      expect(main().getByRole("heading", { name: "15 a 21 de novembro de 2026" })).toBeTruthy();
      expect(main().getAllByRole("cell")).toHaveLength(7);
      expect(main().queryByRole("button", { name: "Pão" })).toBeNull(); // o dia 5 não está nesta semana

      await user.click(main().getByRole("button", { name: "Próxima semana" }));
      expect(main().getByRole("heading", { name: "22 a 28 de novembro de 2026" })).toBeTruthy();
      await user.click(main().getByRole("button", { name: "Semana anterior" }));
      await user.click(main().getByRole("button", { name: "Semana anterior" }));
      await user.click(main().getByRole("button", { name: "Semana anterior" }));
      await user.click(main().getByRole("button", { name: "Semana anterior" }));
      expect(main().getByRole("heading", { name: "25 a 31 de outubro de 2026" })).toBeTruthy();

      await user.click(main().getByRole("button", { name: "Hoje" }));
      await user.click(main().getByRole("tab", { name: "Mês" }));
      expect(main().getByRole("heading", { name: "novembro de 2026" })).toBeTruthy();

      await user.click(main().getByRole("tab", { name: "Semana" }));
      await settle();
      const calendar = (await savedViews(fake)).find((v) => v.config.mode === "calendar")!;
      expect(calendar.config.scale).toBe("week");
    });

    it("'+' do dia, na semana, cria a linha com a data do dia", async () => {
      const { user, fake } = setup();
      await datedBase(user, fake);
      await showView(user, "Calendário");
      await user.click(main().getByRole("tab", { name: "Semana" }));

      await user.click(main().getByRole("button", { name: "Novo item em 18 de novembro de 2026" }));

      await vi.waitFor(async () =>
        expect((await fake.gateway.getDatabase("n1")).rows).toHaveLength(3),
      );
      expect(
        within(main().getByRole("cell", { name: "18 de novembro de 2026" })).getByRole("button", {
          name: "Sem título",
        }),
      ).toBeTruthy();
    });

    it("falha ao criar visão mostra o motivo", async () => {
      const { user, fake } = setup();
      await newDatabase(user);
      vi.spyOn(fake.gateway, "addView").mockRejectedValue(
        new NotesError("notes.limit-reached", "x"),
      );

      await user.click(main().getByRole("button", { name: "Nova visão" }));
      await user.click(
        within(screen.getByRole("dialog", { name: "Nova visão" })).getByRole("button", {
          name: "Lista",
        }),
      );

      expect((await main().findByRole("alert")).textContent).toContain("Limite atingido");
    });

    it("pelo menu da página, o ícone de base aparece na árvore e abrir outra página sai da tabela", async () => {
      const { user } = setup();
      await newDatabase(user);
      await user.click(sidebar().getByRole("button", { name: "Nova página" }));

      expect(await main().findByRole("textbox", { name: "Título" })).toBeTruthy();
      expect(main().queryByRole("region", { name: "Base de dados" })).toBeNull();
    });
  });

  describe("busca global (Ctrl + K)", () => {
    const box = () => within(screen.getByRole("dialog", { name: "Buscar" }));
    const searchInput = () => screen.getByRole("combobox", { name: "Buscar páginas" });

    async function seed(fake: ReturnType<typeof setup>["fake"]) {
      await fake.gateway.create({ title: "Receita de pão", body: "farinha, fermento e água" });
      await fake.gateway.create({ title: "Ação judicial", body: "prazo de recurso" });
      await fake.gateway.create({ title: "Diário", body: "hoje comprei pão e leite" });
    }

    it("Ctrl + K abre a caixa com o foco no campo; Ctrl + K de novo ou Esc fecham", async () => {
      const { user } = setup();

      await user.keyboard("{Control>}k{/Control}");
      expect(screen.getByRole("dialog", { name: "Buscar" })).toBeTruthy();
      expect(document.activeElement).toBe(searchInput());
      expect(box().getByText("Digite para buscar no título e no texto.")).toBeTruthy();

      await user.keyboard("{Control>}k{/Control}");
      expect(screen.queryByRole("dialog", { name: "Buscar" })).toBeNull();

      await user.keyboard("{Control>}k{/Control}");
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog", { name: "Buscar" })).toBeNull();
    });

    it("o botão Buscar da barra lateral também abre; clicar fora fecha", async () => {
      const { user } = setup();

      await user.click(sidebar().getByRole("button", { name: /Buscar/ }));
      expect(screen.getByRole("dialog", { name: "Buscar" })).toBeTruthy();

      await user.click(document.querySelector(".search-backdrop")!);
      expect(screen.queryByRole("dialog", { name: "Buscar" })).toBeNull();
    });

    it("encontra pelo título e pelo texto, sem diferenciar acento nem maiúscula, com trecho", async () => {
      const { user, fake } = setup();
      await seed(fake);
      await user.keyboard("{Control>}k{/Control}");

      await user.type(searchInput(), "PAO");

      const options = await box().findAllByRole("option");
      expect(options).toHaveLength(2);
      expect(options[0]!.textContent).toContain("Receita de pão"); // título primeiro
      expect(options[1]!.textContent).toContain("Diário");
      expect(options[1]!.textContent).toContain("hoje comprei pão e leite");
    });

    it("várias palavras: todas precisam aparecer", async () => {
      const { user, fake } = setup();
      await seed(fake);
      await user.keyboard("{Control>}k{/Control}");

      await user.type(searchInput(), "acao recurso");

      expect(await box().findAllByRole("option")).toHaveLength(1);
      expect(box().getByRole("option").textContent).toContain("Ação judicial");
    });

    it("sem resultado avisa; apagar a busca volta à dica", async () => {
      const { user, fake } = setup();
      await seed(fake);
      await user.keyboard("{Control>}k{/Control}");

      await user.type(searchInput(), "zzzz");
      expect(await box().findByText("Nenhuma página encontrada.")).toBeTruthy();

      await user.clear(searchInput());
      expect(box().getByText("Digite para buscar no título e no texto.")).toBeTruthy();
      expect(box().queryByRole("option")).toBeNull();
    });

    it("setas escolhem em círculo e Enter abre a página escolhida", async () => {
      const { user, fake } = setup();
      await seed(fake);
      await user.keyboard("{Control>}k{/Control}");
      await user.type(searchInput(), "pao");
      await box().findAllByRole("option");

      expect(box().getAllByRole("option")[0]!.getAttribute("aria-selected")).toBe("true");
      await user.keyboard("{ArrowDown}");
      expect(box().getAllByRole("option")[1]!.getAttribute("aria-selected")).toBe("true");
      await user.keyboard("{ArrowDown}");
      expect(box().getAllByRole("option")[0]!.getAttribute("aria-selected")).toBe("true"); // volta ao início
      await user.keyboard("{ArrowUp}");
      expect(box().getAllByRole("option")[1]!.getAttribute("aria-selected")).toBe("true");

      await user.keyboard("{Enter}");

      expect(screen.queryByRole("dialog", { name: "Buscar" })).toBeNull();
      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty(
        "value",
        "Diário",
      );
    });

    it("clicar num resultado abre a página", async () => {
      const { user, fake } = setup();
      await seed(fake);
      await user.keyboard("{Control>}k{/Control}");
      await user.type(searchInput(), "judicial");

      await user.click(await box().findByRole("option"));

      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty(
        "value",
        "Ação judicial",
      );
    });

    it("páginas na lixeira não aparecem", async () => {
      const { user, fake } = setup();
      await seed(fake);
      await fake.gateway.delete("n1");
      await user.keyboard("{Control>}k{/Control}");

      await user.type(searchInput(), "receita");

      expect(await box().findByText("Nenhuma página encontrada.")).toBeTruthy();
    });

    it("falha na busca mostra um aviso", async () => {
      const { user, fake } = setup();
      vi.spyOn(fake.gateway, "search").mockRejectedValue(new NotesError("notes.internal", "x"));
      await user.keyboard("{Control>}k{/Control}");

      await user.type(searchInput(), "algo");

      expect((await box().findByRole("alert")).textContent).toContain(
        "Não foi possível buscar agora",
      );
    });

    it("devolve o foco para onde estava ao fechar", async () => {
      const { user } = setup();
      const button = sidebar().getByRole("button", { name: "Nova página" });
      button.focus();

      await user.keyboard("{Control>}k{/Control}");
      await user.keyboard("{Escape}");

      expect(document.activeElement).toBe(button);
    });
  });

  describe("duplicar página e modelos", () => {
    it("Duplicar, pelo menu da página, cria 'Cópia de …' ao lado, abre a cópia e leva as subpáginas", async () => {
      const { user, fake } = setup();
      await parentWithChild(user); // Pai + Filha
      await user.click(treeitem("Pai"));

      await openPageMenu(user, "Duplicar");

      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty(
        "value",
        "Cópia de Pai",
      );
      const titles = [...fake.notes.values()].map((n) => n.title);
      expect(titles.filter((t) => t === "Filha")).toHaveLength(2); // a original e a cópia dela
      expect(titles).toContain("Pai");
      expect(treeitem("Cópia de Pai")).toBeTruthy();
    });

    it("Duplicar não altera a página original", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "Original");
      const before = fake.notes.get("n1")!;

      await openPageMenu(user, "Duplicar");
      await main().findByDisplayValue("Cópia de Original");

      expect(fake.notes.get("n1")).toEqual(before);
    });

    it("falha ao duplicar mostra o aviso e nada é criado", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "Original");
      vi.spyOn(fake.gateway, "duplicate").mockRejectedValue(new NotesError("notes.internal", "x"));

      await openPageMenu(user, "Duplicar");

      expect((await main().findByRole("alert")).textContent).toContain("Algo deu errado");
      expect(fake.notes.size).toBe(1);
    });

    it("Modelos lista os modelos e criar um deles abre a página nova com o símbolo", async () => {
      const { user, fake } = setup();

      await user.click(sidebar().getByRole("button", { name: /Modelos/ }));
      const list = within(await screen.findByRole("dialog", { name: "Modelos de página" }));
      expect(list.getByText("Notas de reunião")).toBeTruthy();
      expect(list.getByText("Pauta e decisões")).toBeTruthy();
      await user.click(list.getByRole("button", { name: /Entrada de diário/ }));

      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty(
        "value",
        "Entrada de diário",
      );
      expect(fake.notes.get("n1")?.icon).toBe("📓");
      expect(screen.queryByRole("dialog", { name: "Modelos de página" })).toBeNull();
    });

    it("falha ao criar pelo modelo mostra o aviso", async () => {
      const { user, fake } = setup();
      vi.spyOn(fake.gateway, "createFromTemplate").mockRejectedValue(
        new NotesError("notes.internal", "x"),
      );

      await user.click(sidebar().getByRole("button", { name: /Modelos/ }));
      await user.click(
        within(await screen.findByRole("dialog", { name: "Modelos de página" })).getByRole(
          "button",
          { name: /Notas de reunião/ },
        ),
      );

      expect((await main().findByRole("alert")).textContent).toContain("Algo deu errado");
    });

    it("sem modelos disponíveis, avisa", async () => {
      const { user, fake } = setup();
      vi.spyOn(fake.gateway, "listTemplates").mockResolvedValue([]);

      await user.click(sidebar().getByRole("button", { name: /Modelos/ }));

      expect(await screen.findByText("Nenhum modelo disponível.")).toBeTruthy();
    });
  });

  describe("exportar e importar Markdown", () => {
    it("exporta a página: grava o Markdown com o título, avisa onde foi salvo e o aviso fecha", async () => {
      const { user, platform } = setup();
      await newPageTitled(user, "Receita");

      await openPageMenu(user, "Exportar como Markdown");

      await vi.waitFor(() => expect(platform.saveMarkdown).toHaveBeenCalledTimes(1));
      const [title, text] = platform.saveMarkdown.mock.calls[0]!;
      expect(title).toBe("Receita");
      expect(text.startsWith("# Receita\n")).toBe(true);
      expect(text.endsWith("\n")).toBe(true);
      expect(await main().findByText("Exportado para /home/u/Downloads/Receita.md")).toBeTruthy();

      await user.click(main().getByRole("button", { name: "Fechar aviso" }));
      expect(main().queryByText(/Exportado para/)).toBeNull();
    });

    it("o aviso de sucesso some sozinho depois de um tempo", async () => {
      const { user } = setup();
      await newPageTitled(user, "Receita");
      await openPageMenu(user, "Exportar como Markdown");
      await main().findByText(/Exportado para/);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(8100);
      });

      expect(main().queryByText(/Exportado para/)).toBeNull();
    });

    it("exporta uma base de dados como tabela com título e colunas", async () => {
      const { user, platform } = setup();
      await user.click(sidebar().getByRole("button", { name: "Nova base de dados" }));
      await main().findByRole("region", { name: "Base de dados" });
      await user.click(main().getByRole("button", { name: "Adicionar coluna" }));
      const form = within(screen.getByRole("dialog", { name: "Adicionar coluna" }));
      await user.type(form.getByRole("textbox", { name: "Nome da coluna" }), "Obs");
      await user.click(form.getByRole("button", { name: "Adicionar coluna" }));
      await main().findByRole("button", { name: "Coluna Obs" });
      await user.click(main().getByRole("button", { name: "+ Nova linha" }));
      await main().findByRole("textbox", { name: "Título de Sem título" });
      await user.type(main().getByRole("textbox", { name: "Obs — Sem título" }), "olá{Enter}");
      await vi.waitFor(() =>
        expect(
          (main().getByRole("textbox", { name: "Obs — Sem título" }) as HTMLInputElement).value,
        ).toBe("olá"),
      );
      await settle();

      await user.click(topbar().getByRole("button", { name: "Mais ações da página" }));
      await user.click(screen.getByRole("menuitem", { name: "Exportar como Markdown" }));

      await vi.waitFor(() => expect(platform.saveMarkdown).toHaveBeenCalled());
      const [, text] = platform.saveMarkdown.mock.calls[0]!;
      expect(text).toContain("| Título | Obs |");
      expect(text).toContain("| Sem título | olá |");
    });

    it("falha ao salvar o arquivo mostra o motivo", async () => {
      const { user, platform } = setup();
      platform.saveMarkdown.mockRejectedValue(new NotesError("notes.internal", "x"));
      await newPageTitled(user, "Receita");

      await openPageMenu(user, "Exportar como Markdown");

      expect((await main().findByRole("alert")).textContent).toContain("Algo deu errado");
    });

    it("importa um arquivo: o primeiro título vira o título, o texto vira blocos e a página abre", async () => {
      const { user, fake } = setup();
      const file = new File(
        ["# Minha receita\n\nMisture **bem**.\n\n- farinha\n- [x] ovos\n"],
        "x.md",
        {
          type: "text/markdown",
        },
      );

      await user.upload(screen.getByLabelText("Escolher arquivo Markdown"), file);

      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty(
        "value",
        "Minha receita",
      );
      expect(await main().findByText("Importado: Minha receita")).toBeTruthy();
      const note = [...fake.notes.values()][0]!;
      const blocks = JSON.parse(note.content) as Array<{ type: string }>;
      expect(blocks.map((b) => b.type)).toEqual(["paragraph", "bulletListItem", "checkListItem"]);
      expect(note.body).toContain("Misture bem.");
      expect(note.parentId).toBeNull();
    });

    it("sem título no arquivo, usa o nome dele; arquivo vazio cria página vazia", async () => {
      const { user, fake } = setup();

      await user.upload(
        screen.getByLabelText("Escolher arquivo Markdown"),
        new File(["só um texto"], "Notas da aula.md"),
      );
      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty(
        "value",
        "Notas da aula",
      );

      await user.upload(
        screen.getByLabelText("Escolher arquivo Markdown"),
        new File([""], "Vazio.md"),
      );
      await vi.waitFor(() =>
        expect([...fake.notes.values()].map((n) => n.title)).toContain("Vazio"),
      );
    });

    it("o botão Importar Markdown abre o seletor de arquivos", async () => {
      const { user } = setup();
      const input = screen.getByLabelText("Escolher arquivo Markdown") as HTMLInputElement;
      const click = vi.spyOn(input, "click");

      await user.click(sidebar().getByRole("button", { name: "Importar Markdown" }));

      expect(click).toHaveBeenCalled();
    });

    it("falha ao criar a página importada mostra o motivo", async () => {
      const { user, fake } = setup();
      vi.spyOn(fake.gateway, "create").mockRejectedValue(new NotesError("notes.internal", "x"));

      await user.upload(
        screen.getByLabelText("Escolher arquivo Markdown"),
        new File(["# A"], "a.md"),
      );

      expect((await main().findByRole("alert")).textContent).toContain("Algo deu errado");
    });
  });

  describe("lembretes de tarefas", () => {
    type Fake = ReturnType<typeof setup>["fake"];
    const bell = () => sidebar().getByRole("button", { name: /^Lembretes/ });
    const refresh = async () => {
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
        await vi.advanceTimersByTimeAsync(50);
      });
    };

    /** Base "Tarefas" com Prazo (data) e Feita (caixa), uma tarefa por data, e lembretes ligados. */
    async function seedTasks(fake: Fake, tasks: Array<[string, string]>, done: string[] = []) {
      const base = await fake.gateway.createDatabase({ title: "Tarefas", parentId: null });
      const date = await fake.gateway.addProperty({
        databaseId: base.id,
        name: "Prazo",
        type: "date",
      });
      const box = await fake.gateway.addProperty({
        databaseId: base.id,
        name: "Feita",
        type: "checkbox",
      });
      for (const [title, when] of tasks) {
        const row = await fake.gateway.createRow({ databaseId: base.id, title });
        await fake.gateway.setCell({ noteId: row.id, propertyId: date.id, value: when });
        if (done.includes(title)) {
          await fake.gateway.setCell({ noteId: row.id, propertyId: box.id, value: true });
        }
      }
      await fake.gateway.setReminders({
        databaseId: base.id,
        config: { enabled: true, dateProperty: date.id, doneProperty: box.id, doneOption: null },
      });
      return base;
    }
    const at = (hours: number, minutes = 0) =>
      vi.setSystemTime(new Date(2026, 10, 15, hours, minutes));

    it("sem tarefas pendentes não há contagem; o painel avisa e mostra as preferências", async () => {
      const { user } = setup();
      at(8);

      expect(bell().textContent).toBe("◔Lembretes");
      await user.click(bell());

      const panel = within(screen.getByRole("dialog", { name: "Lembretes de tarefas" }));
      expect(panel.getByText("Nenhuma tarefa pede atenção hoje.")).toBeTruthy();
      expect(panel.getByLabelText("Avisar pelo sistema uma vez por dia")).toHaveProperty(
        "checked",
        true,
      );
      expect(panel.getByLabelText("Horário do aviso")).toHaveProperty("value", "09:00");
    });

    it("mostra a contagem e separa atrasadas e de hoje; futuras e concluídas ficam de fora", async () => {
      const { user, fake } = setup();
      at(8);
      await seedTasks(
        fake,
        [
          ["Atrasada", "2026-11-10"],
          ["Vence agora", "2026-11-15"],
          ["Futura", "2026-11-20"],
          ["Concluída", "2026-11-01"],
        ],
        ["Concluída"],
      );

      await refresh();

      expect(sidebar().getByRole("button", { name: "Lembretes (2)" })).toBeTruthy();
      await user.click(bell());
      const panel = within(screen.getByRole("dialog", { name: "Lembretes de tarefas" }));
      expect(
        within(panel.getByRole("region", { name: "Atrasadas" })).getByText("Atrasada"),
      ).toBeTruthy();
      expect(
        within(panel.getByRole("region", { name: "Hoje" })).getByText("Vence agora"),
      ).toBeTruthy();
      expect(panel.queryByText("Futura")).toBeNull();
      expect(panel.queryByText("Concluída")).toBeNull();
      expect(panel.getByText("Tarefas · 10 de novembro de 2026")).toBeTruthy();
    });

    it("clicar numa tarefa abre a página dela e fecha o painel", async () => {
      const { user, fake } = setup();
      at(8);
      await seedTasks(fake, [["Pagar conta", "2026-11-15"]]);
      await refresh();

      await user.click(bell());
      await user.click(
        within(screen.getByRole("dialog", { name: "Lembretes de tarefas" })).getByRole("button", {
          name: /Pagar conta/,
        }),
      );

      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty(
        "value",
        "Pagar conta",
      );
      expect(screen.queryByRole("dialog", { name: "Lembretes de tarefas" })).toBeNull();
    });

    it("o aviso do sistema sai uma única vez por dia, depois do horário, com o resumo", async () => {
      const { fake, platform } = setup();
      at(10);
      await seedTasks(fake, [
        ["Atrasada", "2026-11-10"],
        ["Hoje", "2026-11-15"],
      ]);

      await refresh();
      await refresh();
      await refresh();

      expect(platform.notify).toHaveBeenCalledTimes(1);
      expect(platform.notify).toHaveBeenCalledWith(
        "2 tarefas pedem atenção",
        "1 atrasada · 1 vence hoje: Atrasada, Hoje",
      );
      expect(JSON.parse(localStorage.getItem("tramion.reminders")!).lastDigest).toBe("2026-11-15");
    });

    it("antes do horário não avisa; passando do horário, avisa", async () => {
      const { fake, platform } = setup();
      at(7);
      await seedTasks(fake, [["Hoje", "2026-11-15"]]);

      await refresh();
      expect(platform.notify).not.toHaveBeenCalled();

      at(9, 5);
      await refresh();
      expect(platform.notify).toHaveBeenCalledTimes(1);
    });

    it("com o aviso do sistema desligado, só a contagem aparece; mudar o horário é lembrado", async () => {
      const { user, fake, platform } = setup();
      at(10);
      await user.click(bell());
      const panel = within(screen.getByRole("dialog", { name: "Lembretes de tarefas" }));

      await user.click(panel.getByLabelText("Avisar pelo sistema uma vez por dia"));
      expect(panel.getByLabelText("Horário do aviso")).toHaveProperty("disabled", true);
      await seedTasks(fake, [["Hoje mesmo", "2026-11-15"]]);
      await refresh();

      expect(platform.notify).not.toHaveBeenCalled();
      expect(sidebar().getByRole("button", { name: "Lembretes (1)" })).toBeTruthy();
      expect(JSON.parse(localStorage.getItem("tramion.reminders")!).systemNotifications).toBe(
        false,
      );

      await user.click(panel.getByLabelText("Avisar pelo sistema uma vez por dia"));
      fireEvent.change(panel.getByLabelText("Horário do aviso"), { target: { value: "07:30" } });
      expect(JSON.parse(localStorage.getItem("tramion.reminders")!).time).toBe("07:30");
    });

    it("falha ao conferir as tarefas não quebra a barra lateral", async () => {
      const { fake } = setup();
      at(10);
      vi.spyOn(fake.gateway, "dueTasks").mockRejectedValue(new NotesError("notes.internal", "x"));

      await refresh();

      expect(bell()).toBeTruthy();
    });

    async function openSeededBase(
      user: User,
      fake: Fake,
      events: ReturnType<typeof setup>["events"],
    ) {
      const base = await fake.gateway.createDatabase({ title: "Tarefas", parentId: null });
      await fake.gateway.addProperty({ databaseId: base.id, name: "Prazo", type: "date" });
      await fake.gateway.addProperty({ databaseId: base.id, name: "Feita", type: "checkbox" });
      await fake.gateway.addProperty({ databaseId: base.id, name: "Início", type: "date" });
      act(() => events.emit("note.created", { id: base.id }));
      const pagesTree = await sidebar().findByRole("tree", { name: "Páginas" });
      await user.click(await within(pagesTree).findByRole("treeitem", { name: "Tarefas" }));
      await main().findByRole("region", { name: "Base de dados" });
      return base;
    }

    it("na base: liga os lembretes com padrão sensato (primeira data e a caixa) e dá para ajustar e remover", async () => {
      const { user, fake, events } = setup();
      const base = await openSeededBase(user, fake, events);

      await user.click(main().getByRole("button", { name: "Lembretes da base" }));
      const panel = within(screen.getByRole("dialog", { name: "Lembretes da base" }));
      await user.click(panel.getByLabelText("Lembrar das tarefas desta base"));

      const saved = async () => (await fake.gateway.getDatabase(base.id)).reminders;
      await vi.waitFor(async () => expect((await saved())?.enabled).toBe(true));
      const properties = (await fake.gateway.getDatabase(base.id)).properties;
      const id = (name: string) => properties.find((p) => p.name === name)!.id;
      expect(await saved()).toEqual({
        enabled: true,
        dateProperty: id("Prazo"),
        doneProperty: id("Feita"),
        doneOption: null,
      });
      expect(main().getByRole("button", { name: "Lembretes da base" }).textContent).toBe(
        "Lembretes: ligados",
      );

      await user.click(panel.getByRole("button", { name: "Coluna do prazo" }));
      await user.click(screen.getByRole("option", { name: "Início" }));
      await vi.waitFor(async () => expect((await saved())?.dateProperty).toBe(id("Início")));

      await user.click(panel.getByRole("button", { name: "Tarefa concluída quando" }));
      await user.click(screen.getByRole("option", { name: "Nunca (toda tarefa vencida conta)" }));
      await vi.waitFor(async () => expect((await saved())?.doneProperty).toBeNull());

      await user.click(panel.getByRole("button", { name: "Remover os lembretes desta base" }));
      await vi.waitFor(async () => expect(await saved()).toBeNull());
      expect(main().getByRole("button", { name: "Lembretes da base" }).textContent).toBe(
        "Lembretes",
      );
    });

    it("na base: desligar mantém a configuração mas para de avisar", async () => {
      const { user, fake, events } = setup();
      const base = await openSeededBase(user, fake, events);
      await user.click(main().getByRole("button", { name: "Lembretes da base" }));
      const panel = within(screen.getByRole("dialog", { name: "Lembretes da base" }));
      await user.click(panel.getByLabelText("Lembrar das tarefas desta base"));
      await vi.waitFor(async () =>
        expect((await fake.gateway.getDatabase(base.id)).reminders?.enabled).toBe(true),
      );

      await user.click(panel.getByLabelText("Lembrar das tarefas desta base"));

      await vi.waitFor(async () =>
        expect((await fake.gateway.getDatabase(base.id)).reminders?.enabled).toBe(false),
      );
      expect((await fake.gateway.getDatabase(base.id)).reminders?.dateProperty).toBeTruthy();
    });

    it("base sem coluna de data explica o que falta", async () => {
      const { user, fake, events } = setup();
      const base = await fake.gateway.createDatabase({ title: "Sem datas", parentId: null });
      act(() => events.emit("note.created", { id: base.id }));
      const pagesTree = await sidebar().findByRole("tree", { name: "Páginas" });
      await user.click(await within(pagesTree).findByRole("treeitem", { name: "Sem datas" }));
      await main().findByRole("region", { name: "Base de dados" });

      await user.click(main().getByRole("button", { name: "Lembretes da base" }));

      expect(screen.getByText(/Adicione uma coluna do tipo Data/)).toBeTruthy();
    });

    it("falha ao gravar os lembretes mostra o motivo", async () => {
      const { user, fake, events } = setup();
      await openSeededBase(user, fake, events);
      vi.spyOn(fake.gateway, "setReminders").mockRejectedValue(
        new NotesError("notes.property-invalid", "x"),
      );

      await user.click(main().getByRole("button", { name: "Lembretes da base" }));
      await user.click(
        within(screen.getByRole("dialog", { name: "Lembretes da base" })).getByLabelText(
          "Lembrar das tarefas desta base",
        ),
      );

      expect((await main().findByRole("alert")).textContent).toContain("não são válidos");
    });
  });

  describe("página Hoje", () => {
    type Fake = ReturnType<typeof setup>["fake"];
    const openToday = async (user: User) => {
      await user.click(sidebar().getByRole("button", { name: "Hoje" }));
      return await main().findByRole("heading", { name: "Hoje", level: 1 });
    };

    async function seedAgenda(fake: Fake) {
      const base = await fake.gateway.createDatabase({ title: "Tarefas", parentId: null });
      const date = await fake.gateway.addProperty({
        databaseId: base.id,
        name: "Prazo",
        type: "date",
      });
      const rows: Array<[string, string]> = [
        ["Atrasada", "2026-11-10"],
        ["Vence agora", "2026-11-15"],
        ["Amanhã sim", "2026-11-16"],
        ["Longe demais", "2026-12-25"],
      ];
      for (const [title, when] of rows) {
        const row = await fake.gateway.createRow({ databaseId: base.id, title });
        await fake.gateway.setCell({ noteId: row.id, propertyId: date.id, value: when });
      }
      await fake.gateway.setReminders({
        databaseId: base.id,
        config: { enabled: true, dateProperty: date.id, doneProperty: null, doneOption: null },
      });
      return base;
    }

    it("abre pelo botão Hoje da barra lateral, com a data de hoje e a barra superior", async () => {
      const { user } = setup();
      vi.setSystemTime(new Date(2026, 10, 15, 9, 0));

      await openToday(user);

      expect(main().getByText("15 de novembro de 2026")).toBeTruthy();
      expect(topbar().getByText("Hoje")).toBeTruthy();
      expect(sidebar().getByRole("button", { name: "Hoje" }).getAttribute("aria-current")).toBe(
        "page",
      );
    });

    it("sem tarefas explica como ligar os lembretes", async () => {
      const { user } = setup();

      await openToday(user);

      expect(await main().findByText(/Ligue os lembretes numa base de dados/)).toBeTruthy();
    });

    it("mostra atrasadas, de hoje e os próximos 7 dias, sem o que está longe", async () => {
      const { user, fake, events } = setup();
      vi.setSystemTime(new Date(2026, 10, 15, 9, 0));
      await seedAgenda(fake);
      await openToday(user);
      act(() => events.emit("note.updated", { id: "n1" }));

      expect(
        within(await main().findByRole("region", { name: "Atrasadas" })).getByText("Atrasada"),
      ).toBeTruthy();
      expect(
        within(main().getByRole("region", { name: "Para hoje" })).getByText("Vence agora"),
      ).toBeTruthy();
      const next = within(main().getByRole("region", { name: "Próximos dias" }));
      expect(next.getByText("Amanhã sim")).toBeTruthy();
      expect(main().queryByText("Longe demais")).toBeNull();
    });

    it("clicar numa tarefa abre a página dela", async () => {
      const { user, fake, events } = setup();
      vi.setSystemTime(new Date(2026, 10, 15, 9, 0));
      await seedAgenda(fake);
      await openToday(user);
      act(() => events.emit("note.updated", { id: "n1" }));

      await user.click(await main().findByRole("button", { name: /Vence agora/ }));

      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty(
        "value",
        "Vence agora",
      );
    });

    it("lista as páginas editadas recentemente (sem as linhas de bases) e os favoritos", async () => {
      const { user, fake, events } = setup();
      await seedAgenda(fake);
      const velha = await fake.gateway.create({ title: "Página velha", body: "" });
      await fake.gateway.setPinned(velha.id, true);
      await fake.gateway.create({ title: "Página nova", body: "" });
      act(() => events.emit("note.created", { id: velha.id }));
      await openToday(user);

      const recent = within(await main().findByRole("region", { name: "Editadas recentemente" }));
      expect(recent.getByText("Página nova")).toBeTruthy();
      expect(recent.queryByText("Atrasada")).toBeNull(); // linha de base não é "página recente"
      expect(recent.getByText("Tarefas")).toBeTruthy(); // a própria base aparece
      expect(
        within(main().getByRole("region", { name: "Favoritos" })).getByText("Página velha"),
      ).toBeTruthy();
    });

    it("falha ao carregar as tarefas mostra um aviso, sem quebrar a página", async () => {
      const { user, fake } = setup();
      vi.spyOn(fake.gateway, "dueTasks").mockRejectedValue(new NotesError("notes.internal", "x"));

      await openToday(user);

      expect((await main().findByRole("alert")).textContent).toContain(
        "Não foi possível carregar as tarefas",
      );
    });

    it("sair de Hoje (abrir uma página) e voltar funciona", async () => {
      const { user } = setup();
      await openToday(user);
      await user.click(sidebar().getByRole("button", { name: "Nova página" }));
      expect(await main().findByRole("textbox", { name: "Título" })).toBeTruthy();

      await openToday(user);

      expect(main().queryByRole("textbox", { name: "Título" })).toBeNull();
    });
  });

  describe("backlinks e grafo", () => {
    type Fake = ReturnType<typeof setup>["fake"];
    const mention = (id: string) => [
      { type: "paragraph", content: [{ type: "mention", props: { pageId: id } }] },
    ];

    /** "Alfa" menciona "Beta"; "Gama" não tem ligações. */
    async function seed(fake: Fake, events: ReturnType<typeof setup>["events"]) {
      const beta = await fake.gateway.create({ title: "Beta", body: "" });
      const alfa = await fake.gateway.create({ title: "Alfa", body: "" });
      await fake.gateway.create({ title: "Gama", body: "" });
      await fake.gateway.update({
        id: alfa.id,
        title: "Alfa",
        body: "",
        content: JSON.stringify(mention(beta.id)),
        expectedUpdatedAt: alfa.updatedAt,
      });
      act(() => events.emit("note.created", { id: beta.id }));
      return { alfa, beta };
    }
    const openGraph = async (user: User) => {
      await user.click(sidebar().getByRole("button", { name: "Grafo" }));
      return await main().findByRole("group", { name: "Grafo de conexões entre as páginas" });
    };

    it("a página mostra 'Mencionada em' com quem a menciona, e clicar abre essa página", async () => {
      const { user, fake, events } = setup();
      await seed(fake, events);
      const pagesTree = await sidebar().findByRole("tree", { name: "Páginas" });

      await user.click(await within(pagesTree).findByRole("treeitem", { name: "Beta" }));

      const section = await main().findByRole("region", { name: "Mencionada em" });
      await user.click(within(section).getByRole("button", { name: "Alfa" }));
      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty(
        "value",
        "Alfa",
      );
    });

    it("sem menções não aparece a seção", async () => {
      const { user, fake, events } = setup();
      await seed(fake, events);
      const pagesTree = await sidebar().findByRole("tree", { name: "Páginas" });

      await user.click(await within(pagesTree).findByRole("treeitem", { name: "Gama" }));
      await main().findByRole("textbox", { name: "Título" });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(800);
      });

      expect(main().queryByRole("region", { name: "Mencionada em" })).toBeNull();
    });

    it("o grafo mostra uma página por ponto, as ligações e abre a página ao clicar", async () => {
      const { user, fake, events } = setup();
      await seed(fake, events);

      const canvas = await openGraph(user);

      expect(
        within(canvas)
          .getAllByRole("button")
          .map((n) => n.getAttribute("aria-label"))
          .sort(),
      ).toEqual(["Alfa", "Beta", "Gama"]);
      expect(canvas.querySelectorAll(".graph__edge--link")).toHaveLength(1);
      expect(sidebar().getByRole("button", { name: "Grafo" }).getAttribute("aria-current")).toBe(
        "page",
      );
      expect(topbar().getByText("Grafo")).toBeTruthy();

      await user.click(within(canvas).getByRole("button", { name: "Gama" }));
      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty(
        "value",
        "Gama",
      );
    });

    it("passar o mouse (ou o foco) realça a vizinhança e apaga o resto", async () => {
      const { user, fake, events } = setup();
      await seed(fake, events);
      const canvas = await openGraph(user);

      await user.hover(within(canvas).getByRole("button", { name: "Alfa" }));

      const dim = (name: string) =>
        within(canvas).getByRole("button", { name: name }).classList.contains("graph__node--dim");
      expect(dim("Alfa")).toBe(false);
      expect(dim("Beta")).toBe(false); // vizinha
      expect(dim("Gama")).toBe(true);

      await user.unhover(within(canvas).getByRole("button", { name: "Alfa" }));
      expect(dim("Gama")).toBe(false);
    });

    it("Enter num ponto abre a página; os botões aproximam, afastam e ajustam", async () => {
      const { user, fake, events } = setup();
      await seed(fake, events);
      const canvas = await openGraph(user);
      const transform = () => canvas.querySelector("svg > g, g")!.getAttribute("transform");

      expect(transform()).toContain("scale(1)");
      await user.click(main().getByRole("button", { name: "Aproximar" }));
      expect(transform()).toContain("scale(1.25)");
      await user.click(main().getByRole("button", { name: "Afastar" }));
      await user.click(main().getByRole("button", { name: "Afastar" }));
      expect(transform()).toContain("scale(0.8)");
      await user.click(main().getByRole("button", { name: "Ajustar à tela" }));
      expect(transform()).toContain("scale(1)");

      within(canvas).getByRole("button", { name: "Beta" }).focus();
      await user.keyboard("{Enter}");
      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty(
        "value",
        "Beta",
      );
    });

    it("sem páginas e sem conexões o grafo explica", async () => {
      const { user, fake } = setup();
      await user.click(sidebar().getByRole("button", { name: "Grafo" }));
      expect(await main().findByText("Ainda não há páginas.")).toBeTruthy();

      await fake.gateway.create({ title: "Sozinha", body: "" });
      await user.click(sidebar().getByRole("button", { name: "Hoje" }));
      await user.click(sidebar().getByRole("button", { name: "Grafo" }));
      expect(await main().findByText(/Ainda não há conexões/)).toBeTruthy();
    });

    it("falha ao montar o grafo mostra um aviso", async () => {
      const { user, fake } = setup();
      vi.spyOn(fake.gateway, "graph").mockRejectedValue(new NotesError("notes.internal", "x"));

      await user.click(sidebar().getByRole("button", { name: "Grafo" }));

      expect((await main().findByRole("alert")).textContent).toContain(
        "Não foi possível montar o grafo",
      );
    });
  });

  describe("histórico de versões", () => {
    type Fake = ReturnType<typeof setup>["fake"];
    const history = () => within(screen.getByRole("dialog", { name: "Histórico de versões" }));

    /** Página com duas edições: sobra uma versão antiga ("primeiro texto"), e o estado atual é "segundo texto". */
    async function pageWithHistory(fake: Fake, events: ReturnType<typeof setup>["events"]) {
      const note = await fake.gateway.create({ title: "Receita", body: "" });
      const first = await fake.gateway.update({
        id: note.id,
        title: "Receita",
        body: "primeiro texto",
        content: '[{"type":"paragraph"}]',
        expectedUpdatedAt: note.updatedAt,
      });
      await fake.gateway.update({
        id: note.id,
        title: "Receita nova",
        body: "segundo texto",
        content: '[{"type":"paragraph","n":2}]',
        expectedUpdatedAt: first.updatedAt,
      });
      act(() => events.emit("note.created", { id: note.id }));
      return note;
    }

    async function openHistory(user: User, title: string) {
      const pagesTree = await sidebar().findByRole("tree", { name: "Páginas" });
      await user.click(await within(pagesTree).findByRole("treeitem", { name: title }));
      await main().findByRole("textbox", { name: "Título" });
      await openPageMenu(user, "Histórico de versões");
      return await screen.findByRole("dialog", { name: "Histórico de versões" });
    }

    it("lista as versões antigas com data e começo do texto", async () => {
      const { user, fake, events } = setup();
      await pageWithHistory(fake, events);

      await openHistory(user, "Receita nova");

      const list = history().getByRole("list", { name: "Versões" });
      const items = within(list).getAllByRole("button");
      expect(items).toHaveLength(1);
      expect(items[0]!.textContent).toContain("primeiro texto");
      expect(history().getByText("Escolha uma versão para ver o texto dela.")).toBeTruthy();
    });

    it("escolher uma versão mostra o texto dela; restaurar volta a página e avisa", async () => {
      const { user, fake, events } = setup();
      const note = await pageWithHistory(fake, events);
      await openHistory(user, "Receita nova");

      await user.click(
        within(history().getByRole("list", { name: "Versões" })).getByRole("button"),
      );
      expect(history().getByText("primeiro texto", { selector: "pre" })).toBeTruthy();
      await user.click(history().getByRole("button", { name: "Restaurar esta versão" }));

      await vi.waitFor(() => expect(fake.notes.get(note.id)?.title).toBe("Receita"));
      expect(fake.notes.get(note.id)?.body).toBe("primeiro texto");
      expect(screen.queryByRole("dialog", { name: "Histórico de versões" })).toBeNull();
      expect(await main().findByText(/Versão de .* restaurada/)).toBeTruthy();
      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty(
        "value",
        "Receita",
      );
    });

    it("restaurar guarda o estado atual: ele aparece no histórico e dá para desfazer", async () => {
      const { user, fake, events } = setup();
      const note = await pageWithHistory(fake, events);
      await openHistory(user, "Receita nova");
      await user.click(
        within(history().getByRole("list", { name: "Versões" })).getByRole("button"),
      );
      await user.click(history().getByRole("button", { name: "Restaurar esta versão" }));
      await vi.waitFor(() => expect(fake.notes.get(note.id)?.title).toBe("Receita"));

      await openPageMenu(user, "Histórico de versões");

      const items = within(await screen.findByRole("list", { name: "Versões" })).getAllByRole(
        "button",
      );
      expect(items[0]!.textContent).toContain("segundo texto");
    });

    it("sem versões antigas explica; fechar pelo × e pelo Esc", async () => {
      const { user, fake, events } = setup();
      const note = await fake.gateway.create({ title: "Nova", body: "" });
      act(() => events.emit("note.created", { id: note.id }));
      await openHistory(user, "Nova");
      expect(history().getByText(/Ainda não há versões antigas/)).toBeTruthy();

      await user.click(history().getByRole("button", { name: "Fechar o histórico" }));
      expect(screen.queryByRole("dialog", { name: "Histórico de versões" })).toBeNull();

      await openPageMenu(user, "Histórico de versões");
      await screen.findByRole("dialog", { name: "Histórico de versões" });
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog", { name: "Histórico de versões" })).toBeNull();
    });

    it("falha ao restaurar mostra o motivo e mantém a janela aberta", async () => {
      const { user, fake, events } = setup();
      await pageWithHistory(fake, events);
      await openHistory(user, "Receita nova");
      vi.spyOn(fake.gateway, "restoreVersion").mockRejectedValue(
        new NotesError("notes.conflict", "x"),
      );

      await user.click(
        within(history().getByRole("list", { name: "Versões" })).getByRole("button"),
      );
      await user.click(history().getByRole("button", { name: "Restaurar esta versão" }));

      expect((await history().findByRole("alert")).textContent).toContain(
        "alterada em outro lugar",
      );
      expect(screen.getByRole("dialog", { name: "Histórico de versões" })).toBeTruthy();
    });

    it("falha ao carregar o histórico mostra um aviso", async () => {
      const { user, fake, events } = setup();
      await pageWithHistory(fake, events);
      vi.spyOn(fake.gateway, "listVersions").mockRejectedValue(
        new NotesError("notes.internal", "x"),
      );

      await openHistory(user, "Receita nova");

      expect(await history().findByText("Não foi possível carregar o histórico.")).toBeTruthy();
    });
  });

  describe("modelos criados pela pessoa", () => {
    const templates = () => within(screen.getByRole("dialog", { name: "Modelos de página" }));

    it("Salvar como modelo avisa e o modelo aparece em Modelos; criar dele abre uma página com o nome dele", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "Outra");
      await openPageMenu(user, "Salvar como modelo");
      expect(await main().findByText(/Modelo criado: Outra/)).toBeTruthy();

      await user.click(sidebar().getByRole("button", { name: /Modelos/ }));

      const entry = await templates().findByRole("button", { name: /^Outra/ });
      await user.click(entry);
      await vi.waitFor(() =>
        expect([...fake.notes.values()].filter((n) => n.title === "Outra")).toHaveLength(2),
      );
      expect(await main().findByRole("textbox", { name: "Título" })).toHaveProperty(
        "value",
        "Outra",
      );
    });

    it("dá para apagar um modelo seu; os embutidos não têm botão de apagar", async () => {
      const { user, fake } = setup();
      await newPageTitled(user, "Minha base");
      await openPageMenu(user, "Salvar como modelo");
      await main().findByText(/Modelo criado/);

      await user.click(sidebar().getByRole("button", { name: /Modelos/ }));
      expect(
        templates().queryByRole("button", { name: /Apagar o modelo Notas de reunião/ }),
      ).toBeNull();
      await user.click(
        await templates().findByRole("button", { name: "Apagar o modelo Minha base" }),
      );

      await vi.waitFor(() =>
        expect(templates().queryByRole("button", { name: /Minha base/ })).toBeNull(),
      );
      expect(await fake.gateway.listTemplates()).toHaveLength(2);
    });

    it("base de dados não vira modelo (o item fica desativado) e falhas aparecem", async () => {
      const { user, fake } = setup();
      await user.click(sidebar().getByRole("button", { name: "Nova base de dados" }));
      await main().findByRole("region", { name: "Base de dados" });
      await user.click(topbar().getByRole("button", { name: "Mais ações da página" }));
      expect(
        screen.getByRole("menuitem", { name: "Salvar como modelo" }).hasAttribute("disabled"),
      ).toBe(true);
      await user.keyboard("{Escape}");

      await user.click(sidebar().getByRole("button", { name: "Nova página" }));
      await main().findByRole("textbox", { name: "Título" });
      vi.spyOn(fake.gateway, "saveAsTemplate").mockRejectedValue(
        new NotesError("notes.template-invalid", "x"),
      );
      await openPageMenu(user, "Salvar como modelo");

      expect((await main().findByRole("alert")).textContent).toContain("não pode virar modelo");
    });
  });

  describe("visão de gráfico", () => {
    type Fake = ReturnType<typeof setup>["fake"];

    /** Base com Status (seleção: A fazer / Feito), Qtd (número) e Feita (caixa), e 4 linhas. */
    async function chartBase(user: User, fake: Fake, events: ReturnType<typeof setup>["events"]) {
      const base = await fake.gateway.createDatabase({ title: "Pedidos", parentId: null });
      const status = await fake.gateway.addProperty({
        databaseId: base.id,
        name: "Status",
        type: "select",
      });
      await fake.gateway.updateProperty({
        id: status.id,
        options: [
          { id: "a", name: "A fazer", color: "gray" },
          { id: "b", name: "Feito", color: "green" },
        ],
      });
      const qtd = await fake.gateway.addProperty({
        databaseId: base.id,
        name: "Qtd",
        type: "number",
      });
      const rows: Array<[string, string | null, number]> = [
        ["P1", "a", 10],
        ["P2", "a", 5],
        ["P3", "b", 20],
        ["P4", null, 1],
      ];
      for (const [title, option, amount] of rows) {
        const row = await fake.gateway.createRow({ databaseId: base.id, title });
        if (option)
          await fake.gateway.setCell({ noteId: row.id, propertyId: status.id, value: option });
        await fake.gateway.setCell({ noteId: row.id, propertyId: qtd.id, value: amount });
      }
      act(() => events.emit("note.created", { id: base.id }));
      const pagesTree = await sidebar().findByRole("tree", { name: "Páginas" });
      await user.click(await within(pagesTree).findByRole("treeitem", { name: "Pedidos" }));
      await main().findByRole("region", { name: "Base de dados" });
      await user.click(main().getByRole("button", { name: "Nova visão" }));
      await user.click(
        within(screen.getByRole("dialog", { name: "Nova visão" })).getByRole("button", {
          name: "Gráfico",
        }),
      );
      await main().findByRole("tab", { name: "Gráfico", selected: true });
    }
    const chart = () => within(main().getByRole("list", { name: "Gráfico de Status" }));

    it("mostra uma barra por categoria com a contagem de linhas, 'Sem valor' por último", async () => {
      const { user, fake, events } = setup();
      await chartBase(user, fake, events);

      const rows = chart()
        .getAllByRole("listitem")
        .map((li) => li.textContent);

      expect(rows).toEqual(["A fazer2", "Feito1", "Sem valor1"]);
      expect(main().getByText("Status: linhas")).toBeTruthy();
    });

    it("trocar para somar uma coluna de número muda os valores e mostra as contagens", async () => {
      const { user, fake, events } = setup();
      await chartBase(user, fake, events);

      await user.click(main().getByRole("button", { name: "Medir" }));
      await user.click(screen.getByRole("option", { name: "Somar Qtd" }));

      expect(
        chart()
          .getAllByRole("listitem")
          .map((li) => li.textContent),
      ).toEqual(["A fazer15 (2)", "Feito20 (1)", "Sem valor1 (1)"]);
      expect(main().getByText("Status: soma de Qtd")).toBeTruthy();
    });

    it("a barra maior ocupa 100% e as outras são proporcionais; a cor da opção é usada", async () => {
      const { user, fake, events } = setup();
      await chartBase(user, fake, events);
      await user.click(main().getByRole("button", { name: "Medir" }));
      await user.click(screen.getByRole("option", { name: "Somar Qtd" }));

      const bars = [
        ...main()
          .getByRole("list", { name: "Gráfico de Status" })
          .querySelectorAll<HTMLElement>(".chart__bar"),
      ];

      expect(bars.map((b) => b.style.width)).toEqual(["75%", "100%", "5%"]);
      expect(bars[0]!.classList.contains("db-chip--gray")).toBe(true);
      expect(bars[1]!.classList.contains("db-chip--green")).toBe(true);
    });

    it("o gráfico respeita o filtro da visão", async () => {
      const { user, fake, events } = setup();
      await chartBase(user, fake, events);

      await user.click(main().getByRole("button", { name: "Filtrar" }));
      const panel = within(screen.getByRole("dialog", { name: "Filtrar" }));
      await user.click(panel.getByRole("button", { name: "Adicionar filtro" }));
      await user.type(panel.getByRole("textbox", { name: "Valor do filtro 1" }), "P3");

      expect(
        chart()
          .getAllByRole("listitem")
          .map((li) => li.textContent),
      ).toEqual(["A fazer0", "Feito1"]);
    });

    it("base sem coluna de categoria explica o que falta", async () => {
      const { user, fake, events } = setup();
      const base = await fake.gateway.createDatabase({ title: "Vazia", parentId: null });
      act(() => events.emit("note.created", { id: base.id }));
      const pagesTree = await sidebar().findByRole("tree", { name: "Páginas" });
      await user.click(await within(pagesTree).findByRole("treeitem", { name: "Vazia" }));
      await main().findByRole("region", { name: "Base de dados" });

      await user.click(main().getByRole("button", { name: "Nova visão" }));
      await user.click(
        within(screen.getByRole("dialog", { name: "Nova visão" })).getByRole("button", {
          name: "Gráfico",
        }),
      );

      expect(
        await main().findByText(/adicione uma coluna do tipo Seleção, Caixa de seleção ou Data/),
      ).toBeTruthy();
    });
  });

  describe("exportar tudo", () => {
    const button = () => sidebar().getByRole("button", { name: "Exportar tudo (Markdown)" });

    it("fica desativado sem páginas", () => {
      setup();

      expect(button().hasAttribute("disabled")).toBe(true);
    });

    it("exporta todas as páginas espelhando a hierarquia e avisa a pasta", async () => {
      const { user, platform } = setup();
      await parentWithChild(user); // Pai com a subpágina Filha
      await newPageTitled(user, "Solta");

      await user.click(button());

      await vi.waitFor(() => expect(platform.exportAll).toHaveBeenCalledTimes(1));
      const files = platform.exportAll.mock.calls[0]![0];
      expect(files.map((f) => f.path.join("/")).sort()).toEqual(["Pai", "Pai/Filha", "Solta"]);
      expect(
        files.find((f) => f.path.join("/") === "Pai/Filha")!.content.startsWith("# Filha\n"),
      ).toBe(true);
      expect(
        await main().findByText("3 páginas exportadas para /home/u/Downloads/Tramion"),
      ).toBeTruthy();
    });

    it("uma base de dados vai como tabela, e a linha dela como página dentro da pasta", async () => {
      const { user, fake, platform, events } = setup();
      const base = await fake.gateway.createDatabase({ title: "Pedidos", parentId: null });
      const coluna = await fake.gateway.addProperty({
        databaseId: base.id,
        name: "Obs",
        type: "text",
      });
      const linha = await fake.gateway.createRow({ databaseId: base.id, title: "Pedido 1" });
      await fake.gateway.setCell({ noteId: linha.id, propertyId: coluna.id, value: "urgente" });
      act(() => events.emit("note.created", { id: base.id }));
      await sidebar().findByRole("tree", { name: "Páginas" });

      await user.click(button());

      await vi.waitFor(() => expect(platform.exportAll).toHaveBeenCalled());
      const files = platform.exportAll.mock.calls[0]![0];
      const table = files.find((f) => f.path.join("/") === "Pedidos")!;
      expect(table.content).toContain("| Título | Obs |");
      expect(table.content).toContain("| Pedido 1 | urgente |");
      expect(files.map((f) => f.path.join("/")).sort()).toEqual(["Pedidos", "Pedidos/Pedido 1"]);
    });

    it("falha ao gravar mostra o motivo", async () => {
      const { user, platform } = setup();
      platform.exportAll.mockRejectedValue(new NotesError("notes.content-too-large", "x"));
      await newPageTitled(user, "Uma");

      await user.click(button());

      expect((await main().findByRole("alert")).textContent).toContain("grande demais");
    });
  });

  describe("captura rápida", () => {
    const dialog = () => within(screen.getByRole("dialog", { name: "Captura rápida" }));
    const field = () => screen.getByRole("textbox", { name: "Texto da captura" });

    it("abre pelo botão da barra lateral e pelo atalho Ctrl + Alt + N, com o foco no campo", async () => {
      const { user } = setup();

      await user.click(sidebar().getByRole("button", { name: "Captura rápida" }));
      expect(document.activeElement).toBe(field());
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog", { name: "Captura rápida" })).toBeNull();

      await user.keyboard("{Control>}{Alt>}n{/Alt}{/Control}");
      expect(screen.getByRole("dialog", { name: "Captura rápida" })).toBeTruthy();
    });

    it("abre quando o item da bandeja do sistema avisa", async () => {
      const { platform } = setup();
      const handler = platform.onQuickCapture.mock.calls[0]![0];

      act(() => handler());

      expect(await screen.findByRole("dialog", { name: "Captura rápida" })).toBeTruthy();
    });

    it("Ctrl + Enter guarda na Caixa de entrada (criada na primeira vez), com título e texto, e avisa", async () => {
      const { user, fake } = setup();
      await user.keyboard("{Control>}{Alt>}n{/Alt}{/Control}");

      await user.type(field(), "Ideia de projeto{Enter}primeira nota{Enter}segunda nota");
      await user.keyboard("{Control>}{Enter}{/Control}");

      await vi.waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Captura rápida" })).toBeNull(),
      );
      const notes = [...fake.notes.values()];
      const inbox = notes.find((n) => n.title === "Caixa de entrada")!;
      expect(inbox.icon).toBe("📥");
      const captured = notes.find((n) => n.title === "Ideia de projeto")!;
      expect(captured.parentId).toBe(inbox.id);
      expect(captured.body).toBe("primeira nota\nsegunda nota");
      expect(JSON.parse(captured.content)).toHaveLength(2);
      expect(
        await main().findByText("Guardado na Caixa de entrada: Ideia de projeto"),
      ).toBeTruthy();
    });

    it("a segunda captura reaproveita a Caixa de entrada que já existe", async () => {
      const { user, fake } = setup();
      for (const text of ["Primeira", "Segunda"]) {
        await user.keyboard("{Control>}{Alt>}n{/Alt}{/Control}");
        await user.type(field(), text);
        await user.click(dialog().getByRole("button", { name: "Guardar" }));
        await vi.waitFor(() =>
          expect(screen.queryByRole("dialog", { name: "Captura rápida" })).toBeNull(),
        );
        await vi.waitFor(async () =>
          expect((await fake.gateway.list()).some((n) => n.title === text)).toBe(true),
        );
      }

      const notes = [...fake.notes.values()];
      expect(notes.filter((n) => n.title === "Caixa de entrada")).toHaveLength(1);
      expect(
        notes.filter((n) => n.parentId === notes.find((x) => x.title === "Caixa de entrada")!.id),
      ).toHaveLength(2);
    });

    it("texto vazio não guarda (botão desativado); Esc fecha sem guardar", async () => {
      const { user, fake } = setup();
      await user.click(sidebar().getByRole("button", { name: "Captura rápida" }));
      expect(dialog().getByRole("button", { name: "Guardar" }).hasAttribute("disabled")).toBe(true);

      await user.type(field(), "   ");
      expect(dialog().getByRole("button", { name: "Guardar" }).hasAttribute("disabled")).toBe(true);
      await user.type(field(), "algo{Escape}");

      expect(screen.queryByRole("dialog", { name: "Captura rápida" })).toBeNull();
      expect(fake.notes.size).toBe(0);
    });

    it("falha ao guardar mostra o motivo e mantém a janela aberta com o texto", async () => {
      const { user, fake } = setup();
      vi.spyOn(fake.gateway, "create").mockRejectedValue(new NotesError("notes.internal", "x"));
      await user.keyboard("{Control>}{Alt>}n{/Alt}{/Control}");
      await user.type(field(), "Não pode perder");

      await user.click(dialog().getByRole("button", { name: "Guardar" }));

      expect((await main().findByRole("alert")).textContent).toContain("Algo deu errado");
      expect(screen.getByRole("dialog", { name: "Captura rápida" })).toBeTruthy();
      expect(field()).toHaveProperty("value", "Não pode perder");
    });
  });
});
