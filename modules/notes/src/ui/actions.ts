import type { NavigationStore } from "../application/navigation-store.ts";
import type { NotesService } from "../application/notes-service.ts";
import { planExport } from "../application/export-plan.ts";
import { INBOX_ICON, INBOX_TITLE, captureToPage, findInbox } from "../application/quick-capture.ts";
import { ancestorsOf } from "../application/page-tree.ts";
import { displayValue } from "../application/database-query.ts";
import {
  blocksToMarkdown,
  markdownToBlocks,
  splitImportedTitle,
  tableToMarkdownText,
  MAX_IMPORT_CHARS,
  type MdBlock,
} from "../application/markdown.ts";
import type { NotesPlatform } from "../application/notes-platform.ts";
import { blocksToPlainText, parseContent } from "../application/page-content.ts";
import type { NoteSummary } from "../domain/note.ts";
import { NotesError } from "../domain/errors.ts";
import { messageFor } from "./messages.ts";

/**
 * Ações sobre páginas, compartilhadas pela barra lateral, pela barra superior e pela área principal.
 * Falhas viram uma mensagem no estado de navegação (mostrada na área principal), nunca uma exceção solta.
 */
export function createPageActions(
  service: NotesService,
  store: NavigationStore,
  platform: NotesPlatform,
) {
  const guard = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      store.fail(messageFor(error));
    }
  };

  /** O Markdown de uma página inteira: título em `#` e o texto (ou, numa base de dados, a tabela de linhas). */
  const markdownOf = async (page: NoteSummary, pages: readonly NoteSummary[]): Promise<string> => {
    const titleOf = (id: string) => pages.find((p) => p.id === id)?.title ?? null;
    let body: string;
    if (page.isDatabase) {
      const data = await service.getDatabase(page.id);
      body = tableToMarkdownText(
        ["Título", ...data.properties.map((p) => p.name)],
        data.rows.map((row) => [
          row.title,
          ...data.properties.map((p) => displayValue(p, row.cells[p.id])),
        ]),
      );
    } else {
      const note = await service.get(page.id);
      body = blocksToMarkdown(
        parseContent(note.content, note.body) as unknown as MdBlock[],
        titleOf,
      );
    }
    return `# ${page.title}\n\n${body}`.trimEnd() + "\n";
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

    /**
     * Exporta a página como arquivo Markdown na pasta Downloads (o texto, ou a tabela de linhas se for uma base) e avisa
     * onde foi salvo. Antes, salva o que estiver pendente no editor.
     */
    exportMarkdown: (page: NoteSummary, pages: readonly NoteSummary[]) =>
      guard(async () => {
        await store.flush();
        const path = await platform.saveMarkdown(page.title, await markdownOf(page, pages));
        store.notify(`Exportado para ${path}`);
      }),

    /**
     * Exporta TODAS as páginas como Markdown na pasta Downloads/Tramion, espelhando a hierarquia (uma pasta por página com
     * subpáginas). Substitui os arquivos de uma exportação anterior e nunca apaga nada, então serve de espelho dos dados.
     */
    exportAll: (pages: readonly NoteSummary[]) =>
      guard(async () => {
        await store.flush();
        const files: { path: readonly string[]; content: string }[] = [];
        for (const entry of planExport(pages)) {
          const page = pages.find((p) => p.id === entry.id)!;
          files.push({ path: entry.path, content: await markdownOf(page, pages) });
        }
        const { folder, written } = await platform.exportAll(files);
        store.notify(
          `${written === 1 ? "1 página exportada" : `${written} páginas exportadas`} para ${folder}`,
        );
      }),

    /** Cria uma página nova a partir de um arquivo Markdown (o primeiro título vira o título da página) e a abre. */
    importMarkdown: (file: File) =>
      guard(async () => {
        if (file.size > MAX_IMPORT_CHARS * 4)
          throw new NotesError("notes.content-too-large", "arquivo grande");
        const { title, blocks } = splitImportedTitle(
          markdownToBlocks(await file.text()),
          file.name,
        );
        const created = await service.create({ title, body: "", parentId: null });
        const content = JSON.stringify(blocks);
        await service.update({
          id: created.id,
          title,
          body: blocksToPlainText(blocks as never),
          content,
          expectedUpdatedAt: created.updatedAt,
        });
        store.open(created.id, []);
        store.notify(`Importado: ${title}`);
      }),

    /** Salva a página como modelo (depois de salvar o que estiver pendente no editor) e avisa. */
    saveAsTemplate: (page: NoteSummary) =>
      guard(async () => {
        await store.flush();
        const template = await service.saveAsTemplate(page.id);
        store.notify(`Modelo criado: ${template.name}. Ele aparece em Modelos.`);
      }),

    /**
     * Captura rápida: guarda o texto como uma página dentro da "Caixa de entrada" (criada na primeira vez) e avisa. A
     * primeira linha é o título. Devolve `true` se guardou (texto vazio não guarda nada).
     */
    quickCapture: async (text: string, pages: readonly NoteSummary[]): Promise<boolean> => {
      const captured = captureToPage(text);
      if (!captured) return false;
      try {
        let inbox = findInbox(pages);
        if (!inbox) {
          const created = await service.create({ title: INBOX_TITLE, body: "", parentId: null });
          await service.setAppearance({ id: created.id, icon: INBOX_ICON, cover: null });
          inbox = { ...created, isDatabase: false };
        }
        const note = await service.create({ title: captured.title, body: "", parentId: inbox.id });
        if (captured.blocks.length > 0) {
          await service.update({
            id: note.id,
            title: captured.title,
            body: captured.body,
            content: JSON.stringify(captured.blocks),
            expectedUpdatedAt: note.updatedAt,
          });
        }
        store.notify(`Guardado na ${INBOX_TITLE}: ${captured.title}`);
        return true;
      } catch (error) {
        store.fail(messageFor(error));
        return false;
      }
    },

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
