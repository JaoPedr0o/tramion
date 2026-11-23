// @vitest-environment jsdom
import type { AppEvents, ViewContribution } from "@aun/contracts";
import { createEventBus, createViewRegistry } from "@aun/core";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    reportError: vi.fn<(message: string) => Promise<void>>(async () => {}),
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
});
