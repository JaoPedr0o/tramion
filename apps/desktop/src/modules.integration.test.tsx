// @vitest-environment jsdom
import type { AppEvents, ViewContribution } from "@tramion/contracts";
import { createEventBus, createModuleRegistry, createViewRegistry } from "@tramion/core";
import { createNotesModule, NotesError, type Note, type NotesGateway } from "@tramion/notes";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProbe } from "./test-support/probe";

// Estes testes montam o app como ele é de verdade (núcleo + módulos) e provam a promessa da arquitetura:
// um segundo módulo entra sem editar o primeiro, conversa com ele só por eventos e pode ser removido.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Gateway mínimo em memória (só o necessário para criar e excluir pela interface). */
function memoryGateway(overrides: Partial<NotesGateway> = {}): NotesGateway {
  const notes = new Map<string, Note>();
  let seq = 0;
  const unused = async (): Promise<never> => {
    throw new Error("não usado neste teste");
  };
  return {
    list: async () =>
      [...notes.values()]
        .filter((n) => n.deletedAt === null)
        .map((n) => ({ ...n, isDatabase: false })),
    listTrash: async () =>
      [...notes.values()]
        .filter((n) => n.deletedAt !== null)
        .map((n) => ({ id: n.id, title: n.title, deletedAt: n.deletedAt!, descendantCount: 0 })),
    get: async (id) => notes.get(id)!,
    create: async ({ title, body }) => {
      const note: Note = {
        id: `n${++seq}`,
        title,
        body,
        content: "[]",
        pinned: false,
        icon: null,
        cover: null,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        parentId: null,
        position: 0,
      };
      notes.set(note.id, note);
      return note;
    },
    update: unused,
    setPinned: unused,
    move: unused,
    setAppearance: unused,
    delete: async (id) => {
      notes.set(id, { ...notes.get(id)!, deletedAt: 2 });
      return [id];
    },
    restore: unused,
    purge: unused,
    emptyTrash: unused,
    search: unused,
    createDatabase: unused,
    getDatabase: unused,
    addProperty: unused,
    updateProperty: unused,
    deleteProperty: unused,
    createRow: unused,
    setCell: unused,
    addView: unused,
    updateView: unused,
    deleteView: unused,
    renameNote: unused,
    ...overrides,
  };
}

/** Monta os quatro espaços da tela como a moldura do app faz. */
function Frame({ view }: { view: ViewContribution }) {
  const { sidebarActions: Actions, sidebar: Sidebar, topbar: Topbar, main: Main } = view;
  return (
    <>
      <aside>
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

/** Monta núcleo + módulos como o `bootstrap` do app faz. */
function compose(options: {
  gateway?: NotesGateway;
  probe?: ReturnType<typeof createProbe>;
  probeFirst?: boolean;
  onHandlerError?: (name: string, error: unknown) => void;
}) {
  const events = createEventBus<AppEvents>(
    options.onHandlerError ? { onHandlerError: options.onHandlerError } : {},
  );
  const views = createViewRegistry();
  const registry = createModuleRegistry({ events, views });
  // Este teste não digita no editor: um componente vazio basta no lugar do editor de blocos.
  const notes = createNotesModule(options.gateway ?? memoryGateway(), { BlockEditor: () => null });
  if (options.probe && options.probeFirst) registry.add(options.probe);
  registry.add(notes);
  if (options.probe && !options.probeFirst) registry.add(options.probe);
  const order = registry.start();
  const view = views.list().find((v) => v.id === "notes")!;
  const NotesView = () => <Frame view={view} />;
  return { order, NotesView };
}

async function createAndDeleteANote() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Nova página" }));
  await user.click(await screen.findByRole("button", { name: "Mais ações da página" }));
  await user.click(await screen.findByRole("menuitem", { name: "Mover para a lixeira" }));
}

describe("dois módulos no mesmo app", () => {
  afterEach(cleanup);

  it("o segundo módulo ouve o que o primeiro faz, sem importá-lo", async () => {
    const heard: Array<[string, string]> = [];
    const { NotesView } = compose({ probe: createProbe((e, id) => heard.push([e, id])) });
    render(<NotesView />);

    await createAndDeleteANote();

    expect(heard).toEqual([["note.deleted", "n1"]]);
  });

  it("dependsOn garante a ordem mesmo se o segundo módulo for cadastrado primeiro", () => {
    const { order } = compose({ probe: createProbe(() => {}), probeFirst: true });

    expect(order).toEqual(["notes", "probe"]);
  });

  it("se a operação falha, o outro módulo não é avisado", async () => {
    const heard: string[] = [];
    const failing = memoryGateway({
      delete: async () => {
        throw new NotesError("notes.internal", "falhou");
      },
    });
    const { NotesView } = compose({
      gateway: failing,
      probe: createProbe((e) => heard.push(e)),
    });
    render(<NotesView />);

    await createAndDeleteANote();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(heard).toEqual([]);
  });

  it("um módulo com defeito não derruba o primeiro: a exclusão acontece mesmo assim", async () => {
    const onHandlerError = vi.fn();
    const { NotesView } = compose({
      probe: createProbe(() => {
        throw new Error("o segundo módulo quebrou");
      }),
      onHandlerError,
    });
    render(<NotesView />);

    await createAndDeleteANote();

    expect(await screen.findByText(/Nenhuma página ainda/)).toBeTruthy(); // saiu da lista: foi excluída
    expect(screen.queryByRole("alert")).toBeNull(); // e o usuário não vê erro nenhum
    expect(onHandlerError).toHaveBeenCalledWith("note.deleted", expect.any(Error));
  });

  it("remover o segundo módulo não afeta o primeiro", async () => {
    const { order, NotesView } = compose({}); // sem o probe
    render(<NotesView />);

    await createAndDeleteANote();

    expect(order).toEqual(["notes"]);
    expect(await screen.findByText(/Nenhuma página ainda/)).toBeTruthy();
  });
});
