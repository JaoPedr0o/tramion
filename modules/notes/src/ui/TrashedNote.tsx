import { useState } from "react";
import type { NotesService } from "../application/notes-service.ts";
import type { Note } from "../domain/note.ts";
import { messageFor } from "./messages.ts";
import { subpagesText } from "./TrashList.tsx";

interface Props {
  service: NotesService;
  note: Note;
  /** Quantas subpáginas foram excluídas junto (e serão apagadas junto, se apagar de vez). */
  descendantCount: number;
  /** Chamado depois de restaurar ou apagar de vez. */
  onDone(): void;
}

/** Página na lixeira: somente leitura, com restaurar e apagar de vez (esta pede confirmação). */
export function TrashedNote({ service, note, descendantCount, onDone }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      onDone();
    } catch (error) {
      setMessage(messageFor(error));
    }
  };

  return (
    <article className="note-editor" aria-label="Página na lixeira">
      <div className="note-editor__toolbar">
        <p className="note-editor__status">
          Na lixeira{descendantCount > 0 ? ` (com ${subpagesText(descendantCount)})` : ""}
        </p>
        <button type="button" onClick={() => run(() => service.restore(note.id))}>
          Restaurar
        </button>
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)}>
            Apagar de vez
          </button>
        ) : (
          <>
            <span className="note-editor__confirm">
              Isto não pode ser desfeito.
              {descendantCount > 0 ? ` Também apagará ${subpagesText(descendantCount)}.` : ""}
            </span>
            <button
              type="button"
              className="note-editor__danger"
              onClick={() => run(() => service.purge(note.id))}
            >
              Confirmar
            </button>
            <button type="button" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </>
        )}
      </div>
      {message && <p role="alert">{message}</p>}
      <h2 className="note-editor__readonly-title">{note.title}</h2>
      <pre className="note-editor__readonly-body">{note.body}</pre>
    </article>
  );
}
