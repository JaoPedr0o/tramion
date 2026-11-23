import { useEffect, useId, useRef, useState } from "react";
import {
  createNoteAutosaver,
  type NoteAutosaver,
  type SaveStatus,
} from "../application/note-autosaver.ts";
import type { NavigationStore } from "../application/navigation-store.ts";
import type { NotesService } from "../application/notes-service.ts";
import type { Note } from "../domain/note.ts";
import { messageFor } from "./messages.ts";

interface Props {
  service: NotesService;
  store: NavigationStore;
  note: Note;
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "Salvo",
  dirty: "Alterações ainda não salvas…",
  saving: "Salvando…",
  invalid: "Não foi possível salvar.",
  error: "Não foi possível salvar. Tente editar de novo.",
  conflict: "Conflito: não salvo.",
};

/**
 * A página aberta: título grande e texto, numa coluna centralizada, com salvamento automático.
 * Use `key={note.id}` para trocar de página.
 */
export function NoteEditor({ service, store, note }: Props) {
  const [initial] = useState(note);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [message, setMessage] = useState<string | null>(null);
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
    // Quem excluir a página (barra superior ou lateral) precisa poder salvar antes o que está pendente.
    const unregister = store.registerFlush(() => instance.flush());
    // Ao trocar de página (ou fechar a tela), salva o que estiver pendente antes de sair.
    return () => {
      unregister();
      instance.close();
      autosaver.current = null;
    };
  }, [service, store, initial]);

  const fail = (error: unknown) => store.fail(messageFor(error));

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
    <article className="note-page" aria-label="Página">
      <p role="status" className="note-page__status">
        {STATUS_TEXT[status]}
        {message && status !== "conflict" ? ` ${message}` : ""}
      </p>

      {status === "conflict" && (
        <div role="alert" className="note-page__conflict">
          <p>
            Esta página foi alterada em outro lugar. O seu texto foi mantido aqui, mas ainda não foi
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
        className="note-page__title"
        value={title}
        placeholder="Sem título"
        autoFocus
        onChange={(event) => {
          setTitle(event.target.value);
          autosaver.current?.change({ title: event.target.value, body });
        }}
      />

      <label htmlFor={bodyId} className="visually-hidden">
        Texto da página
      </label>
      <textarea
        id={bodyId}
        className="note-page__body"
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
