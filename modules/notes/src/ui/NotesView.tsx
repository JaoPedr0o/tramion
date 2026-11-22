import { useEffect, useState, type ComponentType } from "react";
import type { NotesService } from "../application/notes-service.ts";
import type { NoteSummary } from "../domain/note.ts";
import "./notes.css";

type State =
  { status: "loading" } | { status: "ready"; notes: readonly NoteSummary[] } | { status: "error" };

/** Cria a tela de notas ligada ao serviço do módulo. */
export function createNotesView(service: NotesService): ComponentType {
  return function NotesView() {
    const [state, setState] = useState<State>({ status: "loading" });

    useEffect(() => {
      let cancelled = false;
      service.list().then(
        (notes) => !cancelled && setState({ status: "ready", notes }),
        () => !cancelled && setState({ status: "error" }),
      );
      return () => {
        cancelled = true;
      };
    }, []);

    return (
      <section className="notes-view" aria-labelledby="notes-title">
        <h1 id="notes-title">Notas</h1>
        {state.status === "loading" && <p role="status">Carregando…</p>}
        {state.status === "error" && <p role="alert">Não foi possível carregar as notas.</p>}
        {state.status === "ready" && state.notes.length === 0 && (
          <p className="notes-view__empty">Nenhuma nota ainda.</p>
        )}
        {state.status === "ready" && state.notes.length > 0 && (
          <ul className="notes-view__list">
            {state.notes.map((note) => (
              <li key={note.id} className="notes-view__item">
                {note.title}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };
}
