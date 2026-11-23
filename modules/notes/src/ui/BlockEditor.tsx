import { PageIcon } from "@aun/ui";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from "@blocknote/core";
import { pt } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import {
  createReactBlockSpec,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import "@blocknote/mantine/style.css";
import { createContext, useContext, useEffect, useImperativeHandle, useRef } from "react";
import {
  blocksToPlainText,
  childPageIds,
  planChildPageSync,
  removedChildPageIds,
  type Block,
} from "../application/page-content.ts";
import type { BlockEditorProps } from "./block-editor-types.ts";
import { useColorScheme } from "./useColorScheme.ts";

/**
 * O editor de blocos (BlockNote). É o ÚNICO arquivo que conhece a biblioteca. Carregado sob demanda,
 * só quando uma página é aberta.
 */

// Como o bloco de subpágina descobre o título da página e abre a página.
const ChildPageContext = createContext<{
  titleOf(pageId: string): string | null;
  open(pageId: string): void;
}>({ titleOf: () => null, open: () => {} });

function ChildPageLink({ pageId }: { pageId: string }) {
  const { titleOf, open } = useContext(ChildPageContext);
  const title = titleOf(pageId);

  return (
    <button
      type="button"
      className="child-page"
      contentEditable={false}
      disabled={title === null}
      onClick={() => open(pageId)}
    >
      <span className="child-page__icon" aria-hidden="true">
        <PageIcon />
      </span>
      <span className="child-page__title">{title ?? "Página indisponível"}</span>
    </button>
  );
}

/** O bloco "subpágina": aponta para uma página pelo id; o título vem da página, não é guardado no bloco. */
const ChildPageBlock = createReactBlockSpec(
  { type: "childPage", propSchema: { pageId: { default: "" } }, content: "none" },
  { render: ({ block }) => <ChildPageLink pageId={block.props.pageId} /> },
);

/**
 * Apelidos em português para o menu "/" (os que a biblioteca traz são de outros idiomas): "/codigo", "/checklist",
 * "/titulo", "/imagem"... Sem acento também, porque é assim que se digita rápido.
 */
const EXTRA_ALIASES: Record<string, string[]> = {
  heading: ["titulo", "título", "cabecalho"],
  heading_2: ["titulo", "título", "subtitulo"],
  heading_3: ["titulo", "título", "subtitulo"],
  quote: ["citacao", "citação"],
  bullet_list: ["lista", "marcadores", "topicos"],
  numbered_list: ["lista", "numerada", "numeros"],
  check_list: ["checklist", "tarefa", "tarefas", "todo", "caixa"],
  toggle_list: ["alternar", "sanfona", "recolher"],
  code_block: ["codigo", "código", "code", "programacao"],
  table: ["tabela"],
  image: ["imagem", "foto", "figura"],
  video: ["video", "vídeo", "filme"],
  audio: ["audio", "áudio", "som", "musica"],
  file: ["arquivo", "anexo", "documento"],
  divider: ["divisor", "linha", "separador"],
};

const withAliases = <T extends { aliases?: string[] }>(item: T): T => {
  const extra = EXTRA_ALIASES[(item as { key?: string }).key ?? ""];
  return extra ? { ...item, aliases: [...(item.aliases ?? []), ...extra] } : item;
};

const schemaSpecs = defaultBlockSpecs;

// Os tipos do BlockNote não são compatíveis com `exactOptionalPropertyTypes` (regra do projeto, que
// não vamos afrouxar por causa de uma biblioteca). Por isso os tipos dela ficam isolados AQUI: o esquema
// é criado com uma conversão e o editor é usado por esta interface mínima, só com o que usamos.
const schema = BlockNoteSchema.create({
  blockSpecs: { ...schemaSpecs, childPage: ChildPageBlock() } as never,
});

interface EditorApi {
  readonly document: ReadonlyArray<{ id: string }>;
  focus(): void;
  removeBlocks(ids: string[]): void;
  insertBlocks(blocks: unknown[], reference: { id: string }, placement: "after"): void;
}

export default function BlockEditor({
  initialBlocks,
  childPages,
  titleOf,
  onChange,
  onChildPageRemoved,
  onCreateSubpage,
  onOpenPage,
  handleRef,
}: BlockEditorProps) {
  const editor = useCreateBlockNote(
    {
      schema,
      dictionary: pt,
      // O editor não aceita lista vazia: sem blocos, começa com o parágrafo vazio padrão.
      ...(initialBlocks.length > 0 ? { initialContent: initialBlocks as never } : {}),
    } as never,
    [],
  );
  const api = editor as unknown as EditorApi;
  const scheme = useColorScheme();
  const previousChildren = useRef(childPageIds(initialBlocks));
  const justCreated = useRef(new Set<string>());

  useImperativeHandle(handleRef, () => ({ focus: () => api.focus() }), [api]);

  const emitChange = () => {
    const blocks = api.document as unknown as Block[];
    // Bloco de subpágina apagado do texto: a subpágina vai para a lixeira.
    const ids = childPageIds(blocks);
    for (const pageId of removedChildPageIds(previousChildren.current, ids))
      onChildPageRemoved(pageId);
    previousChildren.current = ids;
    onChange({ blocks, plainText: blocksToPlainText(blocks) });
  };

  // Mantém os blocos de subpágina consistentes com a árvore. Só com a lista carregada (veja BlockEditorProps).
  useEffect(() => {
    if (childPages === null) return;
    for (const id of [...justCreated.current])
      if (childPages.has(id)) justCreated.current.delete(id);

    const blocks = api.document as unknown as Block[];
    const plan = planChildPageSync(blocks, [...childPages.keys()], justCreated.current);
    if (plan.toRemove.length > 0) api.removeBlocks(plan.toRemove);
    if (plan.toInsert.length > 0) {
      const last = api.document[api.document.length - 1]!;
      api.insertBlocks(
        plan.toInsert.map((pageId) => ({ type: "childPage", props: { pageId } })),
        last,
        "after",
      );
    }
  }, [api, childPages]);

  const pageItem = {
    title: "Página",
    subtext: "Cria uma subpágina dentro desta página",
    aliases: ["page", "pagina", "subpagina", "subpágina"],
    group: "Páginas",
    icon: <PageIcon />,
    onItemClick: async () => {
      const pageId = await onCreateSubpage();
      if (pageId === null) return;
      justCreated.current.add(pageId);
      insertOrUpdateBlockForSlashMenu(
        editor as never,
        {
          type: "childPage",
          props: { pageId },
        } as never,
      );
      emitChange(); // grava o bloco ANTES de abrir a subpágina (abrir fecha este editor)
      onOpenPage(pageId);
    },
  };

  return (
    <ChildPageContext.Provider value={{ titleOf, open: onOpenPage }}>
      <BlockNoteView
        editor={editor as never}
        theme={scheme}
        slashMenu={false}
        onChange={emitChange}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [...getDefaultReactSlashMenuItems(editor as never).map(withAliases), pageItem],
              query,
            )
          }
        />
      </BlockNoteView>
    </ChildPageContext.Provider>
  );
}
