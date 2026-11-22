import { useEffect, useId, useRef, useState } from "react";
import {
  createNoteAutosaver,
  type NoteAutosaver,
  type SaveStatus,
} from "../application/note-autosaver.ts";
import type { NotesService } from "../application/notes-service.ts";
import type { Note } from "../domain/note.ts";
import { messageFor } from "./messages.ts";

interface Props {
  service: NotesService;
  note: Note;
  /** Chamado depois que a nota foi para a lixeira. */
  onDeleted(): void;
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "Salvo",
  dirty: "Alterações ainda não salvas…",
  saving: "Salvando…",
  invalid: "Não foi possível salvar.",
  error: "Não foi possível salvar. Tente editar de novo.",
  conflict: "Conflito: não salvo.",
};

/** Editor de uma nota ativa, com salvamento automático. Use `key={note.id}` para trocar de nota. */
export function NoteEditor({ service, note, onDeleted }: Props) {
  const [initial] = useState(note);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [pinned, setPinned] = useState(note.pinned);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const autosaver = useRef<NoteAutosaver | null>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const instance = createNoteAutosaver({
      initialUpdatedAt: initial.updatedAt,
      save: (draft, expectedUpdatedAt) =>
        service.update({ id: initial.id, ...draft, expectedUpdatedAt }),
      onStatus: (next, error) => {
        setStatus(next);
        setMessage(error ? messageFor(error) : null);
      },
    });
    autosaver.current = instance;
    // Ao trocar de nota (ou fechar a tela), salva o que estiver pendente antes de sair.
    return () => {
      instance.close();
      autosaver.current = null;
    };
  }, [service, initial]);

  // Falha de uma AÇÃO (fixar, excluir, carregar): aviso próprio, separado do estado do salvamento.
  const fail = (error: unknown) => setActionError(messageFor(error));

  const togglePin = () => {
    setActionError(null);
    service.setPinned(note.id, !pinned).then((updated) => setPinned(updated.pinned), fail);
  };

  const remove = async () => {
    setActionError(null);
    try {
      await autosaver.current?.flush();
      await service.delete(note.id);
      onDeleted();
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
      setTitle(current.title);
      setBody(current.body);
      autosaver.current?.reset(current.updatedAt);
    } catch (error) {
      fail(error);
    }
  };

  return (
    <article className="note-editor" aria-label="Editor de nota">
      <div className="note-editor__toolbar">
        <p role="status" className="note-editor__status">
          {STATUS_TEXT[status]}
          {message && status !== "conflict" ? ` ${message}` : ""}
        </p>
        <button type="button" aria-pressed={pinned} onClick={togglePin}>
          {pinned ? "Desafixar" : "Fixar"}
        </button>
        <button type="button" onClick={remove}>
          Excluir
        </button>
      </div>

      {actionError && (
        <p role="alert" className="note-editor__error">
          {actionError}
        </p>
      )}

      {status === "conflict" && (
        <div role="alert" className="note-editor__conflict">
          <p>
            Esta nota foi alterada em outro lugar. O seu texto foi mantido aqui, mas ainda não foi
            salvo.
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
        className="note-editor__title"
        value={title}
        placeholder="Título"
        autoFocus
        onChange={(event) => {
          setTitle(event.target.value);
          autosaver.current?.change({ title: event.target.value, body });
        }}
      />

      <label htmlFor={bodyId} className="visually-hidden">
        Texto da nota
      </label>
      <textarea
        id={bodyId}
        className="note-editor__body"
        value={body}
        placeholder="Escreva aqui…"
        onChange={(event) => {
          setBody(event.target.value);
          autosaver.current?.change({ title, body: event.target.value });
        }}
      />
    </article>
  );
}
