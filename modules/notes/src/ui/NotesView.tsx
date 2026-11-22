import type { AppEvents, EventBus } from "@aun/contracts";
import { useEffect, useState, type ComponentType } from "react";
import type { NotesService } from "../application/notes-service.ts";
import { messageFor } from "./messages.ts";
import { NoteList } from "./NoteList.tsx";
import { NotePanel } from "./NotePanel.tsx";
import { useNoteList, type ListMode } from "./useNoteList.ts";
import "./notes.css";

/** Cria a tela de notas ligada ao serviço e ao barramento do módulo. */
export function createNotesView(deps: {
  service: NotesService;
  events: EventBus<AppEvents>;
}): ComponentType {
  const { service, events } = deps;

  return function NotesView() {
    const [mode, setMode] = useState<ListMode>("notes");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const list = useNoteList(service, events, mode);

    const createNote = async () => {
      try {
        const note = await service.create({ title: "Sem título", body: "" });
        setActionError(null);
        setMode("notes");
        setSelectedId(note.id);
      } catch (error) {
        setActionError(messageFor(error));
      }
    };

    // Atalho: Ctrl+N cria uma nota. O efeito é refeito a cada render para usar sempre a versão atual.
    useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "n") {
          event.preventDefault();
          void createNote();
        }
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    });

    const switchMode = (next: ListMode) => {
      setMode(next);
      setSelectedId(null);
    };

    return (
      <section className="notes-view" aria-label="Notas">
        <div className="notes-view__sidebar">
          <div className="notes-view__header">
            <div role="group" aria-label="Seção" className="notes-view__tabs">
              <button
                type="button"
                aria-pressed={mode === "notes"}
                onClick={() => switchMode("notes")}
              >
                Notas
              </button>
              <button
                type="button"
                aria-pressed={mode === "trash"}
                onClick={() => switchMode("trash")}
              >
                Lixeira
              </button>
            </div>
            {mode === "notes" && (
              <button type="button" className="notes-view__new" onClick={createNote}>
                Nova nota
              </button>
            )}
          </div>

          {actionError && <p role="alert">{actionError}</p>}
          {list.status === "loading" && <p role="status">Carregando…</p>}
          {list.status === "error" && <p role="alert">Não foi possível carregar as notas.</p>}
          {list.status === "ready" && (
            <NoteList
              notes={list.notes}
              selectedId={selectedId}
              onSelect={setSelectedId}
              label={mode === "notes" ? "Notas" : "Notas na lixeira"}
              emptyText={
                mode === "notes"
                  ? "Nenhuma nota ainda. Crie a primeira com Ctrl+N."
                  : "A lixeira está vazia."
              }
            />
          )}
        </div>

        <div className="notes-view__main">
          {selectedId ? (
            <NotePanel
              key={`${mode}:${selectedId}`}
              service={service}
              id={selectedId}
              mode={mode}
              onGone={() => setSelectedId(null)}
            />
          ) : (
            <p className="notes-view__placeholder">Selecione ou crie uma nota.</p>
          )}
        </div>
      </section>
    );
  };
}
