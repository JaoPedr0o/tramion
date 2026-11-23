import { useEffect, useId, useRef, useState } from "react";
import {
  createNoteAutosaver,
  type NoteAutosaver,
  type SaveStatus,
} from "../application/note-autosaver.ts";
import type { NotesService } from "../application/notes-service.ts";
import { ancestorsOf } from "../application/page-tree.ts";
import type { Note, NoteSummary } from "../domain/note.ts";
import { messageFor } from "./messages.ts";
import { MovePicker } from "./MovePicker.tsx";

interface Props {
  service: NotesService;
  note: Note;
  /** Páginas ativas (lista plana, sempre atualizada): servem ao caminho de navegação e ao "Mover para…". */
  pages: readonly NoteSummary[];
  /** Chamado depois que a página foi para a lixeira. */
  onDeleted(): void;
  onNavigate(id: string): void;
  onNewSubpage(parentId: string): void;
  /** Chamado depois de mover; recebe o novo pai (`null` = raiz). */
  onMoved(newParentId: string | null): void;
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "Salvo",
  dirty: "Alterações ainda não salvas…",
  saving: "Salvando…",
  invalid: "Não foi possível salvar.",
  error: "Não foi possível salvar. Tente editar de novo.",
  conflict: "Conflito: não salvo.",
};

/** Editor de uma página ativa, com salvamento automático. Use `key={note.id}` para trocar de página. */
export function NoteEditor({
  service,
  note,
  pages,
  onDeleted,
  onNavigate,
  onNewSubpage,
  onMoved,
}: Props) {
  const [initial] = useState(note);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [pinned, setPinned] = useState(note.pinned);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
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
    // Ao trocar de página (ou fechar a tela), salva o que estiver pendente antes de sair.
    return () => {
      instance.close();
      autosaver.current = null;
    };
  }, [service, initial]);

  // Falha de uma AÇÃO (fixar, excluir, mover, carregar): aviso próprio, separado do estado do salvamento.
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

  const move = async (newParentId: string | null) => {
    setActionError(null);
    try {
      // No fim das irmãs do destino (as irmãs não incluem a própria página).
      const index = pages.filter((p) => p.parentId === newParentId && p.id !== note.id).length;
      await service.move({ id: note.id, newParentId, index });
      setMoving(false);
      onMoved(newParentId);
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

  const ancestors = ancestorsOf(pages, note.id);

  return (
    <article className="note-editor" aria-label="Editor de página">
      {ancestors.length > 0 && (
        <nav aria-label="Caminho">
          <ol className="breadcrumb">
            {ancestors.map((ancestor) => (
              <li key={ancestor.id}>
                <button type="button" onClick={() => onNavigate(ancestor.id)}>
                  {ancestor.title}
                </button>
              </li>
            ))}
            <li aria-current="page">{title.trim() || "Sem título"}</li>
          </ol>
        </nav>
      )}

      <div className="note-editor__toolbar">
        <p role="status" className="note-editor__status">
          {STATUS_TEXT[status]}
          {message && status !== "conflict" ? ` ${message}` : ""}
        </p>
        <button type="button" onClick={() => onNewSubpage(note.id)}>
          Nova subpágina
        </button>
        <button type="button" aria-expanded={moving} onClick={() => setMoving((open) => !open)}>
          Mover para…
        </button>
        <button type="button" aria-pressed={pinned} onClick={togglePin}>
          {pinned ? "Desafixar" : "Fixar"}
        </button>
        <button type="button" onClick={remove}>
          Excluir
        </button>
      </div>

      {moving && (
        <MovePicker
          pages={pages}
          pageId={note.id}
          onMove={move}
          onCancel={() => setMoving(false)}
        />
      )}

      {actionError && (
        <p role="alert" className="note-editor__error">
          {actionError}
        </p>
      )}

      {status === "conflict" && (
        <div role="alert" className="note-editor__conflict">
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
        Texto da página
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
