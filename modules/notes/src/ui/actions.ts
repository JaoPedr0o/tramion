import type { NavigationStore } from "../application/navigation-store.ts";
import type { NotesService } from "../application/notes-service.ts";
import { ancestorsOf } from "../application/page-tree.ts";
import type { NoteSummary } from "../domain/note.ts";
import { messageFor } from "./messages.ts";

/**
 * Ações sobre páginas, compartilhadas pela barra lateral, pela barra superior e pela área principal.
 * Falhas viram uma mensagem no estado de navegação (mostrada na área principal), nunca uma exceção solta.
 */
export function createPageActions(service: NotesService, store: NavigationStore) {
  const guard = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      store.fail(messageFor(error));
    }
  };

  const ancestorIds = (pages: readonly NoteSummary[], id: string) =>
    ancestorsOf(pages, id).map((ancestor) => ancestor.id);

  return {
    /** Cria uma página (na raiz ou dentro de `parentId`), a abre e deixa a árvore aberta até ela. */
    createPage: (parentId: string | null, pages: readonly NoteSummary[]) =>
      guard(async () => {
        const note = await service.create({ title: "Sem título", body: "", parentId });
        store.open(note.id, parentId ? [parentId, ...ancestorIds(pages, parentId)] : []);
      }),

    /**
     * Duplica a página (e as subpáginas) e abre a cópia. Antes, salva o que estiver pendente no editor, para a cópia
     * trazer as últimas teclas.
     */
    duplicatePage: (id: string, pages: readonly NoteSummary[]) =>
      guard(async () => {
        await store.flush();
        const [copyId] = await service.duplicate(id);
        if (copyId) store.open(copyId, ancestorIds(pages, id));
      }),

    /** Cria uma página a partir de um modelo (na raiz ou dentro de `parentId`) e a abre. */
    createFromTemplate: (
      templateId: string,
      parentId: string | null,
      pages: readonly NoteSummary[],
    ) =>
      guard(async () => {
        const note = await service.createFromTemplate({ templateId, parentId });
        store.open(note.id, parentId ? [parentId, ...ancestorIds(pages, parentId)] : []);
      }),

    /** Cria uma base de dados (na raiz ou dentro de `parentId`), a abre e deixa a árvore aberta até ela. */
    createDatabase: (parentId: string | null, pages: readonly NoteSummary[]) =>
      guard(async () => {
        const note = await service.createDatabase({ title: "Nova base de dados", parentId });
        store.open(note.id, parentId ? [parentId, ...ancestorIds(pages, parentId)] : []);
      }),

    /**
     * Cria uma subpágina (ou uma base de dados) SEM abrir: o editor insere o bloco antes de abri-la.
     * Devolve o id, ou `null` se falhou.
     */
    createSubpage: async (
      parentId: string,
      kind: "page" | "database" = "page",
    ): Promise<string | null> => {
      try {
        const note =
          kind === "database"
            ? await service.createDatabase({ title: "Nova base de dados", parentId })
            : await service.create({ title: "Sem título", body: "", parentId });
        return note.id;
      } catch (error) {
        store.fail(messageFor(error));
        return null;
      }
    },

    openPage: (id: string, pages: readonly NoteSummary[]) => store.open(id, ancestorIds(pages, id)),

    /**
     * Manda a página (e as subpáginas) para a lixeira. Antes, salva o que estiver pendente no editor, para
     * não perder as últimas teclas. Se a página aberta foi afetada, fecha o editor.
     */
    deletePage: (id: string) =>
      guard(async () => {
        await store.flush();
        const affected = await service.delete(id);
        const selected = store.getState().selectedId;
        if (selected !== null && affected.includes(selected)) store.close();
      }),

    toggleFavorite: (page: NoteSummary) =>
      guard(async () => {
        await service.setPinned(page.id, !page.pinned);
      }),

    /** Move para o FIM das irmãs do destino e deixa o destino aberto na árvore. */
    movePage: (id: string, newParentId: string | null, pages: readonly NoteSummary[]) =>
      guard(async () => {
        const index = pages.filter((p) => p.parentId === newParentId && p.id !== id).length;
        await service.move({ id, newParentId, index });
        if (newParentId) store.reveal([newParentId, ...ancestorIds(pages, newParentId)]);
      }),
  };
}
