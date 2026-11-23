import { useEffect, useState } from "react";
import type { NavigationStore } from "../application/navigation-store.ts";
import type { NotesService } from "../application/notes-service.ts";
import type { Note } from "../domain/note.ts";
import { messageFor } from "./messages.ts";
import { NoteEditor } from "./NoteEditor.tsx";

interface Props {
  service: NotesService;
  store: NavigationStore;
  id: string;
}

type State =
  { status: "loading" } | { status: "ready"; note: Note } | { status: "error"; message: string };

/** Carrega a página completa e mostra o editor. Use `key={id}` para recarregar ao trocar de página. */
export function NotePanel({ service, store, id }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    service.get(id).then(
      (note) => !cancelled && setState({ status: "ready", note }),
      (error) => !cancelled && setState({ status: "error", message: messageFor(error) }),
    );
    return () => {
      cancelled = true;
    };
  }, [service, id]);

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
  return <NoteEditor service={service} store={store} note={state.note} />;
}
