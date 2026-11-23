import { useEffect, useState } from "react";
import type { NotesService } from "../application/notes-service.ts";
import type { Note, NoteSummary } from "../domain/note.ts";
import { messageFor } from "./messages.ts";
import { NoteEditor } from "./NoteEditor.tsx";
import { TrashedNote } from "./TrashedNote.tsx";

interface Props {
  service: NotesService;
  id: string;
  mode: "notes" | "trash";
  pages: readonly NoteSummary[];
  /** Só na lixeira: quantas subpáginas foram excluídas junto. */
  descendantCount: number;
  /** A página deixou de estar na lista (excluída, restaurada ou apagada de vez). */
  onGone(): void;
  onNavigate(id: string): void;
  onNewSubpage(parentId: string): void;
  onMoved(newParentId: string | null): void;
}

type State =
  { status: "loading" } | { status: "ready"; note: Note } | { status: "error"; message: string };

/** Carrega a página completa e mostra o editor (ativa) ou a visão da lixeira. Use `key` para recarregar. */
export function NotePanel({
  service,
  id,
  mode,
  pages,
  descendantCount,
  onGone,
  onNavigate,
  onNewSubpage,
  onMoved,
}: Props) {
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
    <TrashedNote
      service={service}
      note={state.note}
      descendantCount={descendantCount}
      onDone={onGone}
    />
  ) : (
    <NoteEditor
      service={service}
      note={state.note}
      pages={pages}
      onDeleted={onGone}
      onNavigate={onNavigate}
      onNewSubpage={onNewSubpage}
      onMoved={onMoved}
    />
  );
}
