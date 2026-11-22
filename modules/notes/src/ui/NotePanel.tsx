import { useEffect, useState } from "react";
import type { NotesService } from "../application/notes-service.ts";
import type { Note } from "../domain/note.ts";
import { messageFor } from "./messages.ts";
import { NoteEditor } from "./NoteEditor.tsx";
import { TrashedNote } from "./TrashedNote.tsx";
import type { ListMode } from "./useNoteList.ts";

interface Props {
  service: NotesService;
  id: string;
  mode: ListMode;
  /** A nota deixou de estar na lista (excluída, restaurada ou apagada de vez). */
  onGone(): void;
}

type State =
  { status: "loading" } | { status: "ready"; note: Note } | { status: "error"; message: string };

/** Carrega a nota completa e mostra o editor (ativa) ou a visão da lixeira. Use `key` para recarregar. */
export function NotePanel({ service, id, mode, onGone }: Props) {
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

  if (state.status === "loading") return <p role="status">Carregando…</p>;
  if (state.status === "error") return <p role="alert">{state.message}</p>;

  return mode === "trash" ? (
    <TrashedNote service={service} note={state.note} onDone={onGone} />
  ) : (
    <NoteEditor service={service} note={state.note} onDeleted={onGone} />
  );
}
