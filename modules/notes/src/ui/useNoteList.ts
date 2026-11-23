import type { AppEvents, EventBus } from "@tramion/contracts";
import { useEffect, useState } from "react";
import type { NotesService } from "../application/notes-service.ts";
import type { NoteSummary, TrashSummary } from "../domain/note.ts";

export type ListState<T> =
  { status: "loading" } | { status: "ready"; items: readonly T[] } | { status: "error" };

const CHANGE_EVENTS = [
  "note.created",
  "note.updated",
  "note.moved",
  "note.deleted",
  "note.restored",
  "note.purged",
] as const;

// Funções do módulo (estáveis): servem de dependência dos efeitos sem recriar a assinatura a cada render.
const fetchPages = (service: NotesService) => service.list();
const fetchTrash = (service: NotesService) => service.listTrash();

/**
 * Lista sempre atualizada: recarrega a cada evento `note.*`, venha de onde vier (esta tela ou, no
 * futuro, outro módulo). A tela não precisa lembrar de "atualizar a lista" depois de cada ação.
 */
function useLiveList<T>(
  fetch: (service: NotesService) => Promise<readonly T[]>,
  service: NotesService,
  events: EventBus<AppEvents>,
): ListState<T> {
  const [state, setState] = useState<ListState<T>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(service).then(
        (items) => !cancelled && setState({ status: "ready", items }),
        () => !cancelled && setState({ status: "error" }),
      );
    };

    load();
    const unsubscribers = CHANGE_EVENTS.map((name) => events.on(name, load));
    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [fetch, service, events]);

  return state;
}

/** Páginas ativas, planas e ordenadas por posição. */
export function usePages(
  service: NotesService,
  events: EventBus<AppEvents>,
): ListState<NoteSummary> {
  return useLiveList(fetchPages, service, events);
}

/** Raízes da lixeira, com a contagem de subpáginas. */
export function useTrash(
  service: NotesService,
  events: EventBus<AppEvents>,
): ListState<TrashSummary> {
  return useLiveList(fetchTrash, service, events);
}
