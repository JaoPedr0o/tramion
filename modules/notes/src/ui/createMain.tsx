import { Logo } from "@tramion/ui";
import { useEffect, type ComponentType } from "react";
import type { NotesUiDeps } from "./deps.ts";
import { NotePanel } from "./NotePanel.tsx";
import { SearchDialog } from "./SearchDialog.tsx";
import { TrashView } from "./TrashView.tsx";
import { useNavigation } from "./useNavigation.ts";

/** Área principal: a página aberta, a lixeira ou um convite a abrir/criar uma página. */
export function createMain(deps: NotesUiDeps): ComponentType {
  const { service, events, store } = deps;

  return function NotesMain() {
    const nav = useNavigation(store);

    // Ctrl + K (ou Cmd + K) abre e fecha a busca. Se o editor já tratou a tecla (ele usa Ctrl + K para criar link com
    // texto selecionado), a busca não abre.
    useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.defaultPrevented || event.altKey || event.shiftKey) return;
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
        event.preventDefault();
        deps.search.toggle();
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    return (
      <div className="notes-main">
        <SearchDialog deps={deps} />
        {nav.actionError && (
          <p role="alert" className="notes-main__error">
            {nav.actionError}
          </p>
        )}
        {nav.mode === "trash" ? (
          <TrashView service={service} events={events} store={store} />
        ) : nav.selectedId ? (
          <NotePanel key={nav.selectedId} deps={deps} id={nav.selectedId} />
        ) : (
          <div className="notes-empty">
            <Logo size={72} />
            <h1 className="notes-empty__title">Tramion</h1>
            <p className="notes-main__placeholder">Selecione ou crie uma página.</p>
          </div>
        )}
      </div>
    );
  };
}
