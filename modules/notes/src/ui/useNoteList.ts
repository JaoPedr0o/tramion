import type { AppEvents, EventBus } from "@aun/contracts";
import { useEffect, useState } from "react";
import type { NotesService } from "../application/notes-service.ts";
import type { NoteSummary } from "../domain/note.ts";

export type ListMode = "notes" | "trash";

export type ListState =
  { status: "loading" } | { status: "ready"; notes: readonly NoteSummary[] } | { status: "error" };

const CHANGE_EVENTS = [
  "note.created",
  "note.updated",
  "note.deleted",
  "note.restored",
  "note.purged",
] as const;

/**
 * Lista de notas sempre atualizada: recarrega a cada evento `note.*`, venha de onde vier (esta tela
 * ou, no futuro, outro módulo). A tela não precisa lembrar de "atualizar a lista" depois de cada ação.
 */
export function useNoteList(
  service: NotesService,
  events: EventBus<AppEvents>,
  mode: ListMode,
): ListState {
  // O estado guarda a que modo pertence: ao trocar de modo, não mostra por um instante a lista do outro.
  const [state, setState] = useState<ListState & { mode: ListMode }>({ mode, status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const request = mode === "trash" ? service.listTrash() : service.list();
      request.then(
        (notes) => !cancelled && setState({ mode, status: "ready", notes }),
        () => !cancelled && setState({ mode, status: "error" }),
      );
    };

    load();
    const unsubscribers = CHANGE_EVENTS.map((name) => events.on(name, load));
    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [service, events, mode]);

  return state.mode === mode ? state : { status: "loading" };
}
