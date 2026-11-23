import { IconButton, PlusIcon, SearchIcon, TrashIcon } from "@tramion/ui";
import { useEffect, useRef, useState, type ComponentType } from "react";
import type { NoteSummary } from "../domain/note.ts";
import type { NotesUiDeps } from "./deps.ts";
import { DueTasksButton } from "./DueTasksButton.tsx";
import { MoveDialog } from "./MoveDialog.tsx";
import { PageGlyph } from "./PageGlyph.tsx";
import { PageTree } from "./PageTree.tsx";
import { TemplatesButton } from "./TemplatesButton.tsx";
import { useNavigation } from "./useNavigation.ts";
import { usePages } from "./useNoteList.ts";

/**
 * Conteúdo da barra lateral: Favoritos, a árvore de Páginas (com "adicionar" e ações ao passar o mouse) e,
 * no rodapé, a Lixeira. Também cuida dos atalhos Ctrl+N e Ctrl+Shift+N, que valem com a barra recolhida.
 */
export function createSidebar(deps: NotesUiDeps): ComponentType {
  const { service, events, store, search, actions } = deps;
  return function NotesSidebar() {
    const nav = useNavigation(store);
    const pages = usePages(service, events);
    const list = pages.status === "ready" ? pages.items : [];
    const [moving, setMoving] = useState<NoteSummary | null>(null);
    const importInput = useRef<HTMLInputElement>(null);

    // Ctrl+N cria uma página na raiz; Ctrl+Shift+N, uma subpágina da aberta. O efeito é refeito a cada
    // render para usar sempre a versão atual do estado.
    useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (!event.ctrlKey || event.altKey || event.key.toLowerCase() !== "n") return;
        event.preventDefault();
        const parent = event.shiftKey && nav.mode === "pages" ? nav.selectedId : null;
        void actions.createPage(parent, list);
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    });

    const favorites = list
      .filter((page) => page.pinned)
      .sort((a, b) => a.title.localeCompare(b.title));
    const selectedId = nav.mode === "pages" ? nav.selectedId : null;

    return (
      <div className="notes-sidebar">
        <button
          type="button"
          className="sidebar-row"
          aria-current={nav.mode === "today" ? "page" : undefined}
          onClick={store.showToday}
        >
          <span className="sidebar-row__icon" aria-hidden="true">
            ◐
          </span>
          <span className="sidebar-row__title">Hoje</span>
        </button>
        <button
          type="button"
          className="sidebar-row"
          aria-current={nav.mode === "graph" ? "page" : undefined}
          onClick={store.showGraph}
        >
          <span className="sidebar-row__icon" aria-hidden="true">
            ✳
          </span>
          <span className="sidebar-row__title">Grafo</span>
        </button>
        <button type="button" className="sidebar-row" onClick={store.showCapture}>
          <span className="sidebar-row__icon" aria-hidden="true">
            ✎
          </span>
          <span className="sidebar-row__title">Captura rápida</span>
        </button>
        <button type="button" className="sidebar-row sidebar-search" onClick={() => search.open()}>
          <span className="sidebar-row__icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <span className="sidebar-row__title">Buscar</span>
          <kbd className="sidebar-search__keys">Ctrl K</kbd>
        </button>
        <DueTasksButton deps={deps} pages={list} />
        <TemplatesButton deps={deps} pages={list} />
        <button type="button" className="sidebar-row" onClick={() => importInput.current?.click()}>
          <span className="sidebar-row__icon" aria-hidden="true">
            <PlusIcon />
          </span>
          <span className="sidebar-row__title">Importar Markdown</span>
        </button>
        <button
          type="button"
          className="sidebar-row"
          disabled={list.length === 0}
          onClick={() => void actions.exportAll(list)}
        >
          <span className="sidebar-row__icon" aria-hidden="true">
            <PlusIcon />
          </span>
          <span className="sidebar-row__title">Exportar tudo (Markdown)</span>
        </button>
        <input
          ref={importInput}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          aria-label="Escolher arquivo Markdown"
          className="visually-hidden"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = ""; // permite escolher o mesmo arquivo de novo
            if (file) void actions.importMarkdown(file);
          }}
        />
        {favorites.length > 0 && (
          <section aria-labelledby="notes-favorites-title">
            <h2 id="notes-favorites-title" className="sidebar-label">
              Favoritos
            </h2>
            <ul className="sidebar-list" aria-label="Favoritos">
              {favorites.map((page) => (
                <li key={page.id}>
                  <button
                    type="button"
                    className="sidebar-row"
                    aria-current={page.id === selectedId ? "page" : undefined}
                    onClick={() => actions.openPage(page.id, list)}
                  >
                    <span className="sidebar-row__icon" aria-hidden="true">
                      <PageGlyph icon={page.icon} isDatabase={page.isDatabase} />
                    </span>
                    <span className="sidebar-row__title">{page.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="notes-pages-title">
          <div className="sidebar-section-header">
            <h2 id="notes-pages-title" className="sidebar-label">
              Páginas
            </h2>
            <span className="sidebar-section-header__actions">
              <IconButton
                label="Adicionar página"
                onClick={() => void actions.createPage(null, list)}
              >
                <PlusIcon />
              </IconButton>
            </span>
          </div>

          {pages.status === "loading" && (
            <p role="status" className="sidebar-note">
              Carregando…
            </p>
          )}
          {pages.status === "error" && (
            <p role="alert" className="sidebar-note">
              Não foi possível carregar as páginas.
            </p>
          )}
          {pages.status === "ready" && list.length === 0 && (
            <p className="sidebar-note">Nenhuma página ainda. Crie a primeira com Ctrl+N.</p>
          )}

          {list.length > 0 && (
            <PageTree
              pages={list}
              selectedId={selectedId}
              expanded={nav.expanded}
              label="Páginas"
              onToggle={store.toggle}
              onSelect={(id) => actions.openPage(id, list)}
              onNewSubpage={(page) => void actions.createPage(page.id, list)}
              onDuplicate={(page) => void actions.duplicatePage(page.id, list)}
              onExport={(page) => void actions.exportMarkdown(page, list)}
              onHistory={(page) => store.showHistory(page.id)}
              onSaveTemplate={(page) => void actions.saveAsTemplate(page)}
              onMove={setMoving}
              onToggleFavorite={(page) => void actions.toggleFavorite(page)}
              onDelete={(page) => void actions.deletePage(page.id)}
            />
          )}

          <button
            type="button"
            className="sidebar-row sidebar-row--muted"
            onClick={() => void actions.createPage(null, list)}
          >
            <span className="sidebar-row__icon" aria-hidden="true">
              <PlusIcon />
            </span>
            <span className="sidebar-row__title">Adicionar uma página</span>
          </button>
        </section>

        <div className="notes-sidebar__footer">
          <button
            type="button"
            className="sidebar-row"
            aria-current={nav.mode === "trash" ? "page" : undefined}
            onClick={store.showTrash}
          >
            <span className="sidebar-row__icon" aria-hidden="true">
              <TrashIcon />
            </span>
            <span className="sidebar-row__title">Lixeira</span>
          </button>
        </div>

        {moving && (
          <MoveDialog
            pages={list}
            pageId={moving.id}
            onClose={() => setMoving(null)}
            onMove={(parent) => {
              setMoving(null);
              void actions.movePage(moving.id, parent, list);
            }}
          />
        )}
      </div>
    );
  };
}
