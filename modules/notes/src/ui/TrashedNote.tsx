import { useState } from "react";
import type { NotesService } from "../application/notes-service.ts";
import type { Note } from "../domain/note.ts";
import { messageFor } from "./messages.ts";

interface Props {
  service: NotesService;
  note: Note;
  /** Chamado depois de restaurar ou apagar de vez. */
  onDone(): void;
}

/** Nota na lixeira: somente leitura, com restaurar e apagar de vez (esta pede confirmação). */
export function TrashedNote({ service, note, onDone }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
      onDone();
    } catch (error) {
      setMessage(messageFor(error));
    }
  };

  return (
    <article className="note-editor" aria-label="Nota na lixeira">
      <div className="note-editor__toolbar">
        <p className="note-editor__status">Na lixeira</p>
        <button type="button" onClick={() => run(() => service.restore(note.id))}>
          Restaurar
        </button>
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)}>
            Apagar de vez
          </button>
        ) : (
          <>
            <span className="note-editor__confirm">Isto não pode ser desfeito.</span>
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
