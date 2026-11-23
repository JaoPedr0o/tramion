import type { AppEvents, EventBus } from "@aun/contracts";
import { useEffect, useState, type ComponentType } from "react";
import type { NotesService } from "../application/notes-service.ts";
import { ancestorsOf } from "../application/page-tree.ts";
import { messageFor } from "./messages.ts";
import { NoteList } from "./NoteList.tsx";
import { NotePanel } from "./NotePanel.tsx";
import { PageTree } from "./PageTree.tsx";
import { TrashList } from "./TrashList.tsx";
import { usePages, useTrash } from "./useNoteList.ts";
import "./notes.css";

type Mode = "notes" | "trash";

/** Cria a tela de páginas ligada ao serviço e ao barramento do módulo. */
export function createNotesView(deps: {
  service: NotesService;
  events: EventBus<AppEvents>;
}): ComponentType {
  const { service, events } = deps;

  return function NotesView() {
    const [mode, setMode] = useState<Mode>("notes");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
    const [actionError, setActionError] = useState<string | null>(null);
    const pages = usePages(service, events);
    const trash = useTrash(service, events);
    const pageList = pages.status === "ready" ? pages.items : [];

    /** Deixa abertas as páginas indicadas e os ancestrais delas, para a página alvo aparecer na árvore. */
    const reveal = (ids: readonly string[]) =>
      setExpanded((previous) => {
        const next = new Set(previous);
        for (const id of ids) {
          next.add(id);
          for (const ancestor of ancestorsOf(pageList, id)) next.add(ancestor.id);
        }
        return next;
      });

    const select = (id: string) => {
      setSelectedId(id);
      reveal(ancestorsOf(pageList, id).map((ancestor) => ancestor.id));
    };

    const toggle = (id: string) =>
      setExpanded((previous) => {
        const next = new Set(previous);
        if (!next.delete(id)) next.add(id);
        return next;
      });

    const createPage = async (parentId: string | null) => {
      try {
        const note = await service.create({ title: "Sem título", body: "", parentId });
        setActionError(null);
        setMode("notes");
        if (parentId) reveal([parentId]);
        setSelectedId(note.id);
      } catch (error) {
        setActionError(messageFor(error));
      }
    };

    // Atalhos: Ctrl+N cria uma página na raiz; Ctrl+Shift+N cria uma subpágina da selecionada.
    // O efeito é refeito a cada render para usar sempre a versão atual das funções.
    useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (!event.ctrlKey || event.altKey || event.key.toLowerCase() !== "n") return;
        event.preventDefault();
        void createPage(event.shiftKey && mode === "notes" ? selectedId : null);
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    });

    const switchMode = (next: Mode) => {
      setMode(next);
      setSelectedId(null);
    };

    const pinned = pageList
      .filter((page) => page.pinned)
      .sort((a, b) => a.title.localeCompare(b.title));
    const trashItem =
      trash.status === "ready" ? trash.items.find((item) => item.id === selectedId) : undefined;

    return (
      <section className="notes-view" aria-label="Páginas">
        <div className="notes-view__sidebar">
          <div className="notes-view__header">
            <div role="group" aria-label="Seção" className="notes-view__tabs">
              <button
                type="button"
                aria-pressed={mode === "notes"}
                onClick={() => switchMode("notes")}
              >
                Páginas
              </button>
              <button
                type="button"
                aria-pressed={mode === "trash"}
                onClick={() => switchMode("trash")}
              >
                Lixeira
              </button>
            </div>
            {mode === "notes" && (
              <button type="button" className="notes-view__new" onClick={() => createPage(null)}>
                Nova página
              </button>
            )}
          </div>

          {actionError && <p role="alert">{actionError}</p>}

          {mode === "notes" && (
            <>
              {pages.status === "loading" && <p role="status">Carregando…</p>}
              {pages.status === "error" && (
                <p role="alert">Não foi possível carregar as páginas.</p>
              )}
              {pages.status === "ready" && pageList.length === 0 && (
                <p className="notes-view__empty">
                  Nenhuma página ainda. Crie a primeira com Ctrl+N.
                </p>
              )}
              {pinned.length > 0 && (
                <section aria-labelledby="notes-pinned-title">
                  <h2 id="notes-pinned-title" className="notes-view__heading">
                    Fixadas
                  </h2>
                  <NoteList
                    notes={pinned}
                    selectedId={selectedId}
                    onSelect={select}
                    label="Fixadas"
                  />
                </section>
              )}
              {pageList.length > 0 && (
                <PageTree
                  pages={pageList}
                  selectedId={selectedId}
                  expanded={expanded}
                  onToggle={toggle}
                  onSelect={select}
                  label="Páginas"
                />
              )}
            </>
          )}

          {mode === "trash" && (
            <>
              {trash.status === "loading" && <p role="status">Carregando…</p>}
              {trash.status === "error" && <p role="alert">Não foi possível carregar a lixeira.</p>}
              {trash.status === "ready" && (
                <TrashList items={trash.items} selectedId={selectedId} onSelect={setSelectedId} />
              )}
            </>
          )}
        </div>

        <div className="notes-view__main">
          {selectedId ? (
            <NotePanel
              key={`${mode}:${selectedId}`}
              service={service}
              id={selectedId}
              mode={mode}
              pages={pageList}
              descendantCount={trashItem?.descendantCount ?? 0}
              onGone={() => setSelectedId(null)}
              onNavigate={select}
              onNewSubpage={(parentId) => void createPage(parentId)}
              onMoved={(newParentId) => {
                if (newParentId) reveal([newParentId]);
              }}
            />
          ) : (
            <p className="notes-view__placeholder">Selecione ou crie uma página.</p>
          )}
        </div>
      </section>
    );
  };
}
