import { LinkIcon, PageIcon } from "@aun/ui";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  createCodeBlockSpec,
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { codeBlockOptions, syntaxHighlighter } from "@blocknote/code-block";
import { pt } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import {
  createReactBlockSpec,
  createReactInlineContentSpec,
  getDefaultReactSlashMenuItems,
  AddBlockButton,
  BlockColorsItem,
  DragHandleButton,
  DragHandleMenu,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  useBlockNoteEditor,
  useComponentsContext,
  useCreateBlockNote,
  useExtensionState,
} from "@blocknote/react";
import "@blocknote/mantine/style.css";
import { createContext, useContext, useEffect, useImperativeHandle, useRef, useState } from "react";
import { hostnameOf, normalizeHttpUrl, videoEmbed } from "../application/embeds.ts";
import { detectLanguage } from "../application/language-detect.ts";
import {
  blocksToPlainText,
  childPageIds,
  emptyPlaceholderIds,
  planChildPageSync,
  removedChildPageIds,
  type Block,
} from "../application/page-content.ts";
import { isCurrentOption, TURN_INTO_OPTIONS, TURNABLE_TYPES } from "../application/turn-into.ts";
import type { BlockEditorProps } from "./block-editor-types.ts";
import { PageGlyph } from "./PageGlyph.tsx";
import { useColorScheme } from "./useColorScheme.ts";

/**
 * O editor de blocos (BlockNote). É o ÚNICO arquivo que conhece a biblioteca. Carregado sob demanda,
 * só quando uma página é aberta.
 */

// Os tipos do BlockNote não são compatíveis com `exactOptionalPropertyTypes` (regra do projeto, que
// não vamos afrouxar por causa de uma biblioteca). Por isso os tipos dela ficam isolados AQUI: o esquema
// é criado com uma conversão e o editor é usado por esta interface mínima, só com o que usamos.
interface EditorApi {
  readonly document: ReadonlyArray<{ id: string }>;
  focus(): void;
  removeBlocks(ids: string[]): void;
  insertBlocks(blocks: unknown[], reference: { id: string }, placement: "after"): void;
  updateBlock(id: string, update: unknown): void;
  insertInlineContent(content: unknown[]): void;
  getTextCursorPosition(): {
    block: { id: string; type: string; props?: Record<string, unknown>; content?: unknown };
  };
}

// O que os blocos e as menções precisam da página que os contém.
const EditorContext = createContext<{
  titleOf(pageId: string): string | null;
  iconOf(pageId: string): string | null;
  open(pageId: string): void;
  openExternal(url: string): void;
}>({ titleOf: () => null, iconOf: () => null, open: () => {}, openExternal: () => {} });

// ───────── Bloco de subpágina ─────────

function ChildPageLink({ pageId }: { pageId: string }) {
  const { titleOf, iconOf, open } = useContext(EditorContext);
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
        <PageGlyph icon={iconOf(pageId)} />
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

// ───────── Menção (@página) ─────────

function MentionChip({ pageId }: { pageId: string }) {
  const { titleOf, iconOf, open } = useContext(EditorContext);
  const title = titleOf(pageId);

  return (
    <button
      type="button"
      className="mention"
      contentEditable={false}
      disabled={title === null}
      onClick={() => open(pageId)}
    >
      <PageGlyph icon={iconOf(pageId)} size={14} />
      <span>{title ?? "Página indisponível"}</span>
    </button>
  );
}

/** Menção: um trecho DENTRO do texto que aponta para uma página (o título vem da página). */
const MentionInline = createReactInlineContentSpec(
  { type: "mention", propSchema: { pageId: { default: "" } }, content: "none" },
  { render: (props) => <MentionChip pageId={props.inlineContent.props.pageId} /> },
);

// ───────── Blocos de incorporar link e vídeo ─────────

/** Campo para colar um endereço. `onSubmit` devolve a mensagem de erro, ou `null` se deu certo. */
function LinkInput({
  label,
  placeholder,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  onSubmit(text: string): string | null;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="embed-input"
      contentEditable={false}
      onSubmit={(event) => {
        event.preventDefault();
        setError(onSubmit(value));
      }}
    >
      <label className="visually-hidden">{label}</label>
      <input
        value={placeholder === "" ? "" : value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
      />
      <button type="submit">Incorporar</button>
      {error && (
        <p role="alert" className="embed-input__error">
          {error}
        </p>
      )}
    </form>
  );
}

function BookmarkView({ blockId, url, editor }: { blockId: string; url: string; editor: unknown }) {
  const { openExternal } = useContext(EditorContext);

  if (!url) {
    return (
      <LinkInput
        label="Endereço do link"
        placeholder="Cole o link e tecle Enter…"
        onSubmit={(text) => {
          const normalized = normalizeHttpUrl(text);
          if (!normalized) return "Este endereço não é um link http ou https válido.";
          (editor as EditorApi).updateBlock(blockId, { props: { url: normalized } });
          return null;
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className="bookmark"
      contentEditable={false}
      onClick={() => openExternal(url)}
    >
      <span className="bookmark__icon" aria-hidden="true">
        <LinkIcon size={18} />
      </span>
      <span className="bookmark__text">
        <span className="bookmark__title">{hostnameOf(url)}</span>
        <span className="bookmark__url">{url}</span>
      </span>
    </button>
  );
}

/** Link como cartão (domínio e endereço). Abre no navegador do sistema. */
const BookmarkBlock = createReactBlockSpec(
  { type: "bookmark", propSchema: { url: { default: "" } }, content: "none" },
  {
    render: ({ block, editor }) => (
      <BookmarkView blockId={block.id} url={block.props.url} editor={editor} />
    ),
  },
);

function EmbedVideoView({
  blockId,
  url,
  editor,
}: {
  blockId: string;
  url: string;
  editor: unknown;
}) {
  const embed = url ? videoEmbed(url) : null;

  if (!embed) {
    return (
      <LinkInput
        label="Endereço do vídeo"
        placeholder="Cole o link do YouTube ou do Vimeo e tecle Enter…"
        onSubmit={(text) => {
          const normalized = normalizeHttpUrl(text);
          if (!normalized || !videoEmbed(normalized)) return "Cole um link do YouTube ou do Vimeo.";
          (editor as EditorApi).updateBlock(blockId, { props: { url: normalized } });
          return null;
        }}
      />
    );
  }
  return (
    <div className="embed-video" contentEditable={false}>
      <iframe
        src={embed.embedUrl}
        title="Vídeo incorporado"
        allow="fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      />
    </div>
  );
}

/** Vídeo do YouTube ou do Vimeo, tocando dentro da página. O endereço da incorporação é montado a partir do link guardado. */
const EmbedVideoBlock = createReactBlockSpec(
  { type: "embedVideo", propSchema: { url: { default: "" } }, content: "none" },
  {
    render: ({ block, editor }) => (
      <EmbedVideoView blockId={block.id} url={block.props.url} editor={editor} />
    ),
  },
);

// ───────── Esquema e menus ─────────

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    childPage: ChildPageBlock(),
    bookmark: BookmarkBlock(),
    embedVideo: EmbedVideoBlock(),
    // Bloco de código com a lista de linguagens (menu no próprio bloco) e Tab para recuar.
    codeBlock: createCodeBlockSpec({
      indentLineWithTab: true,
      defaultLanguage: codeBlockOptions.defaultLanguage,
      supportedLanguages: codeBlockOptions.supportedLanguages,
    }),
  } as never,
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: MentionInline } as never,
});

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

/** "Transformar em": troca o tipo do bloco do menu (o texto é preservado). Só aparece em blocos de texto. */
function TurnIntoItem() {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor();
  const block = useExtensionState(SideMenuExtension, { selector: (state) => state?.block });

  if (!block || !TURNABLE_TYPES.has(block.type)) return null;
  return (
    <Components.Generic.Menu.Root position="right" sub portalElement={null}>
      <Components.Generic.Menu.Trigger sub>
        <Components.Generic.Menu.Item subTrigger>Transformar em</Components.Generic.Menu.Item>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown sub className="bn-menu-dropdown bn-drag-handle-menu">
        {TURN_INTO_OPTIONS.map((option) => (
          <Components.Generic.Menu.Item
            key={option.id}
            checked={isCurrentOption(block as never, option)}
            onClick={() =>
              (editor as unknown as EditorApi).updateBlock(block.id, {
                type: option.type,
                ...(option.props ? { props: option.props } : {}),
              })
            }
          >
            {option.label}
          </Components.Generic.Menu.Item>
        ))}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}

/** O menu da alça do bloco: Transformar em, Cores e Excluir. */
function BlockMenu() {
  return (
    <DragHandleMenu>
      <TurnIntoItem />
      <BlockColorsItem>Cores</BlockColorsItem>
      <RemoveBlockItem>Excluir</RemoveBlockItem>
    </DragHandleMenu>
  );
}

/** Menu lateral do bloco: "+" para inserir e a alça (arrastar), que abre o menu acima. */
function CustomSideMenu(props: Parameters<typeof SideMenu>[0]) {
  return (
    <SideMenu {...props}>
      <AddBlockButton />
      <DragHandleButton {...props} dragHandleMenu={BlockMenu} />
    </SideMenu>
  );
}

export default function BlockEditor({
  initialBlocks,
  childPages,
  titleOf,
  iconOf,
  pages,
  onChange,
  onChildPageRemoved,
  onCreateSubpage,
  onOpenPage,
  onUploadFile,
  onOpenExternal,
  handleRef,
}: BlockEditorProps) {
  // O envio de arquivos é registrado uma vez, na criação do editor: a referência abaixo mantém a versão atual.
  const upload = useRef(onUploadFile);
  useEffect(() => {
    upload.current = onUploadFile;
  });

  const editor = useCreateBlockNote(
    {
      schema,
      dictionary: pt,
      uploadFile: (file: File) => upload.current(file),
      extensions: [syntaxHighlighter],
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

  // Blocos de imagem, vídeo etc. que o usuário abriu e abandonou (sem endereço) ficariam sobrando na página.
  // São removidos ao abrir a página e, depois, quando o cursor sai de perto deles, com uma pausa para não
  // atrapalhar quem ainda está escolhendo o arquivo (o seletor é uma janela suspensa fora do editor).
  const cleanupTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const removeAbandonedPlaceholders = () => {
    if (document.querySelector(".mantine-Popover-dropdown")) return; // seletor aberto: ainda em uso
    let cursorId: string | undefined;
    try {
      cursorId = api.getTextCursorPosition().block.id;
    } catch {
      cursorId = undefined;
    }
    const ids = emptyPlaceholderIds(api.document as unknown as Block[], cursorId);
    if (ids.length > 0) api.removeBlocks(ids);
  };
  const scheduleCleanup = () => {
    clearTimeout(cleanupTimer.current);
    cleanupTimer.current = setTimeout(removeAbandonedPlaceholders, 1200);
  };
  useEffect(() => {
    removeAbandonedPlaceholders();
    return () => clearTimeout(cleanupTimer.current);
    // Só ao abrir a página (e ao sair): o resto é por seleção.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Colar num bloco de código sem linguagem escolhida: descobre a linguagem pelo trecho. Respeita a escolha
  // do usuário: se ele já escolheu uma linguagem, nada muda.
  const detectLanguageAfterPaste = () => {
    setTimeout(() => {
      try {
        const block = api.getTextCursorPosition().block;
        if (block.type !== "codeBlock") return;
        const current = block.props?.language;
        if (typeof current === "string" && current !== "" && current !== "text") return;
        const language = detectLanguage(blocksToPlainText([block as unknown as Block]));
        if (language) api.updateBlock(block.id, { props: { language } });
      } catch {
        /* sem cursor no editor: nada a fazer */
      }
    }, 0);
  };

  const insertBlock = (type: string) =>
    insertOrUpdateBlockForSlashMenu(editor as never, { type } as never);

  const customItems = [
    {
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
    },
    {
      title: "Link com cartão",
      subtext: "Mostra um link como um cartão",
      aliases: ["link", "bookmark", "marcador", "site", "url", "embed", "incorporar"],
      group: "Incorporar",
      icon: <LinkIcon />,
      onItemClick: () => insertBlock("bookmark"),
    },
    {
      title: "Vídeo do YouTube ou Vimeo",
      subtext: "Toca o vídeo dentro da página, a partir de um link",
      aliases: ["youtube", "vimeo", "video", "vídeo", "embed", "incorporar"],
      group: "Incorporar",
      icon: <LinkIcon />,
      onItemClick: () => insertBlock("embedVideo"),
    },
  ];

  return (
    <EditorContext.Provider
      value={{ titleOf, iconOf, open: onOpenPage, openExternal: onOpenExternal }}
    >
      {/* Links de verdade no texto abrem no navegador do sistema, nunca dentro do app. */}
      <div
        className="block-editor"
        onPaste={detectLanguageAfterPaste}
        onClick={(event) => {
          const href = (event.target as HTMLElement).closest?.("a[href]")?.getAttribute("href");
          if (href && /^https?:\/\//i.test(href)) {
            event.preventDefault();
            onOpenExternal(href);
          }
        }}
      >
        <BlockNoteView
          editor={editor as never}
          theme={scheme}
          slashMenu={false}
          sideMenu={false}
          onChange={emitChange}
          onSelectionChange={scheduleCleanup}
        >
          <SideMenuController sideMenu={CustomSideMenu} />
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                [
                  ...getDefaultReactSlashMenuItems(editor as never).map(withAliases),
                  ...customItems,
                ],
                query,
              )
            }
          />
          <SuggestionMenuController
            triggerCharacter="@"
            getItems={async (query) =>
              filterSuggestionItems(
                pages.map((page) => ({
                  title: page.title,
                  icon: <PageGlyph icon={page.icon} />,
                  onItemClick: () =>
                    api.insertInlineContent([{ type: "mention", props: { pageId: page.id } }, " "]),
                })),
                query,
              ).slice(0, 10)
            }
          />
        </BlockNoteView>
      </div>
    </EditorContext.Provider>
  );
}
