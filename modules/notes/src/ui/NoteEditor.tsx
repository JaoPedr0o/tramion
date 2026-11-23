import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "@aun/ui";
import {
  createNoteAutosaver,
  type Draft,
  type NoteAutosaver,
  type SaveStatus,
} from "../application/note-autosaver.ts";
import { parseContent } from "../application/page-content.ts";
import { ancestorsOf } from "../application/page-tree.ts";
import type { Note } from "../domain/note.ts";
import type { BlockEditorHandle } from "./block-editor-types.ts";
import type { NotesUiDeps } from "./deps.ts";
import { messageFor } from "./messages.ts";
import { PageCover, PageHeader, type Picker } from "./PageAppearance.tsx";
import { usePages } from "./useNoteList.ts";

interface Props {
  deps: NotesUiDeps;
  note: Note;
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "Salvo",
  dirty: "Alterações ainda não salvas…",
  saving: "Salvando…",
  invalid: "Não foi possível salvar.",
  error: "Não foi possível salvar. Tente editar de novo.",
  conflict: "Conflito: não salvo.",
};

/**
 * A página aberta: título grande e, abaixo, o editor de BLOCOS, numa coluna centralizada, com salvamento
 * automático. As subpáginas aparecem no texto como blocos de link. Use `key={note.id}` para trocar de página.
 */
export function NoteEditor({ deps, note }: Props) {
  const { service, events, store, actions, platform, loadEmojiData, BlockEditor } = deps;
  const [initial] = useState(note);
  const [title, setTitle] = useState(note.title);
  const [editor, setEditor] = useState(() => ({
    key: 0,
    blocks: parseContent(note.content, note.body),
  }));
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [message, setMessage] = useState<string | null>(null);
  const autosaver = useRef<NoteAutosaver | null>(null);
  const handle = useRef<BlockEditorHandle>(null);
  // O que está na tela agora (título + texto + blocos): é o que o salvamento automático envia.
  const draft = useRef<Draft>({ title: note.title, body: note.body, content: note.content });
  const titleId = useId();

  // Subpáginas desta página, a partir da lista de páginas (sempre atualizada pelos eventos).
  const pages = usePages(service, events);
  const allPages = pages.status === "ready" ? pages.items : null;
  const childPages = useMemo(
    () =>
      allPages
        ? new Map(allPages.filter((p) => p.parentId === note.id).map((p) => [p.id, p] as const))
        : null,
    [allPages, note.id],
  );
  const titleOf = useCallback(
    (pageId: string) => allPages?.find((p) => p.id === pageId)?.title ?? null,
    [allPages],
  );

  const iconOf = useCallback(
    (pageId: string) => allPages?.find((p) => p.id === pageId)?.icon ?? null,
    [allPages],
  );

  useEffect(() => {
    const instance = createNoteAutosaver({
      initialUpdatedAt: initial.updatedAt,
      save: (next, expectedUpdatedAt) =>
        service.update({ id: initial.id, ...next, expectedUpdatedAt }),
      onStatus: (next, error) => {
        setStatus(next);
        setMessage(error ? messageFor(error) : null);
      },
    });
    autosaver.current = instance;
    // Quem excluir a página (barra superior ou lateral) precisa poder salvar antes o que está pendente.
    const unregister = store.registerFlush(() => instance.flush());
    // Ao trocar de página (ou fechar a tela), salva o que estiver pendente antes de sair.
    return () => {
      unregister();
      instance.close();
      autosaver.current = null;
    };
  }, [service, store, initial]);

  const fail = (error: unknown) => store.fail(messageFor(error));

  // Símbolo e capa: gravados na hora (não passam pelo salvamento automático do texto) e sem mudar a versão.
  const [appearance, setAppearance] = useState({ icon: note.icon, cover: note.cover });
  const [picker, setPicker] = useState<Picker>(null);
  const saveAppearance = async (next: { icon: string | null; cover: string | null }) => {
    try {
      const updated = await service.setAppearance({ id: note.id, ...next });
      setAppearance({ icon: updated.icon, cover: updated.cover });
      setPicker(null);
    } catch (error) {
      fail(error);
    }
  };

  const keepMine = async () => {
    try {
      const current = await service.get(note.id);
      await autosaver.current?.keepMine(current.updatedAt);
    } catch (error) {
      fail(error);
    }
  };

  const loadSaved = async () => {
    try {
      const current = await service.get(note.id);
      draft.current = { title: current.title, body: current.body, content: current.content };
      setTitle(current.title);
      // Novo `key`: o editor recomeça com os blocos da versão salva.
      setEditor((previous) => ({
        key: previous.key + 1,
        blocks: parseContent(current.content, current.body),
      }));
      autosaver.current?.reset(current.updatedAt);
    } catch (error) {
      fail(error);
    }
  };

  return (
    <div className="note-view">
      <PageCover
        cover={appearance.cover}
        onChange={() => setPicker("cover")}
        onRemove={() => void saveAppearance({ ...appearance, cover: null })}
      />
      <article className="note-page" aria-label="Página">
        <PageHeader
          icon={appearance.icon}
          hasCover={appearance.cover !== null}
          picker={picker}
          setPicker={setPicker}
          platform={platform}
          loadEmojiData={loadEmojiData}
          onSetIcon={(icon) => void saveAppearance({ ...appearance, icon })}
          onSetCover={(cover) => void saveAppearance({ ...appearance, cover })}
        />
        <p role="status" className="note-page__status">
          {STATUS_TEXT[status]}
          {message && status !== "conflict" ? ` ${message}` : ""}
        </p>

        {status === "conflict" && (
          <div role="alert" className="note-page__conflict">
            <p>
              Esta página foi alterada em outro lugar. O seu texto foi mantido aqui, mas ainda não
              foi salvo.
            </p>
            <button type="button" onClick={keepMine}>
              Manter o meu texto
            </button>
            <button type="button" onClick={loadSaved}>
              Carregar a versão salva
            </button>
          </div>
        )}

        <label htmlFor={titleId} className="visually-hidden">
          Título
        </label>
        <input
          id={titleId}
          className="note-page__title"
          value={title}
          placeholder="Sem título"
          autoFocus
          onChange={(event) => {
            setTitle(event.target.value);
            draft.current = { ...draft.current, title: event.target.value };
            autosaver.current?.change(draft.current);
          }}
          onKeyDown={(event) => {
            // Enter no título passa para o texto, como no Notion.
            if (event.key === "Enter") {
              event.preventDefault();
              handle.current?.focus();
            }
          }}
        />

        <div className="note-page__editor">
          <ErrorBoundary
            onError={(error, stack) =>
              void platform.reportError(`${error.stack ?? error.message}\n${stack}`)
            }
            fallback={(_error, reset) => (
              <div role="alert" className="note-page__failure">
                <p>
                  Não foi possível exibir o conteúdo desta página. O texto salvo continua intacto.
                </p>
                <button type="button" onClick={reset}>
                  Tentar de novo
                </button>
              </div>
            )}
          >
            <Suspense fallback={<p className="note-page__loading">Carregando o editor…</p>}>
              <BlockEditor
                key={editor.key}
                initialBlocks={editor.blocks}
                childPages={childPages}
                titleOf={titleOf}
                iconOf={iconOf}
                pages={allPages ?? []}
                handleRef={handle}
                onUploadFile={async (file) => {
                  try {
                    return await platform.uploadAsset(file);
                  } catch (error) {
                    fail(error);
                    throw error;
                  }
                }}
                onOpenExternal={(url) => void platform.openExternal(url).catch(fail)}
                onChange={({ blocks, plainText }) => {
                  draft.current = {
                    ...draft.current,
                    body: plainText,
                    content: JSON.stringify(blocks),
                  };
                  autosaver.current?.change(draft.current);
                }}
                // Apagar o bloco de uma subpágina a manda para a lixeira (reversível), como no Notion.
                onChildPageRemoved={(pageId) => {
                  if (childPages?.has(pageId)) void actions.deletePage(pageId);
                }}
                onCreateSubpage={() => actions.createSubpage(note.id)}
                // Os blocos de subpágina apontam para filhas desta página. A filha recém-criada ainda pode não estar
                // na lista, então o caminho é montado a partir desta página (que fica aberta na árvore).
                onOpenPage={(pageId) =>
                  store.open(pageId, [
                    note.id,
                    ...ancestorsOf(allPages ?? [], note.id).map((ancestor) => ancestor.id),
                  ])
                }
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </article>
    </div>
  );
}
