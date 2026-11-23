import { useEffect, useState } from "react";
import type { Note } from "../domain/note.ts";
import type { NotesUiDeps } from "./deps.ts";
import { messageFor } from "./messages.ts";
import { DatabaseView } from "./DatabaseView.tsx";
import { NoteEditor } from "./NoteEditor.tsx";
import { usePages } from "./useNoteList.ts";

interface Props {
  deps: NotesUiDeps;
  id: string;
}

type State =
  { status: "loading" } | { status: "ready"; note: Note } | { status: "error"; message: string };

/** Carrega a página completa e mostra o editor. Use `key={id}` para recarregar ao trocar de página. */
export function NotePanel({ deps, id }: Props) {
  const { service } = deps;
  const [state, setState] = useState<State>({ status: "loading" });
  const pages = usePages(service, deps.events);
  const isDatabase =
    pages.status === "ready" && pages.items.some((page) => page.id === id && page.isDatabase);

  useEffect(() => {
    if (isDatabase) return; // uma base se carrega sozinha (`getDatabase`)
    let cancelled = false;
    service.get(id).then(
      (note) => !cancelled && setState({ status: "ready", note }),
      (error) => !cancelled && setState({ status: "error", message: messageFor(error) }),
    );
    return () => {
      cancelled = true;
    };
  }, [service, id, isDatabase]);

  if (isDatabase) return <DatabaseView deps={deps} id={id} />;
  // Ainda não se sabe se a página é uma base: espera a lista (evita mostrar o editor numa base por um instante).
  if (pages.status === "loading")
    return (
      <p role="status" className="notes-main__placeholder">
        Carregando…
      </p>
    );
  if (state.status === "loading")
    return (
      <p role="status" className="notes-main__placeholder">
        Carregando…
      </p>
    );
  if (state.status === "error")
    return (
      <p role="alert" className="notes-main__error">
        {state.message}
      </p>
    );
  return <NoteEditor deps={deps} note={state.note} />;
}
