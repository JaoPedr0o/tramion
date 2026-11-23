import { CHANGE_EVENTS } from "../application/change-events.ts";
import { useCallback, useEffect, useState } from "react";
import type { NoteSummary, PageRef } from "../domain/note.ts";
import type { NotesUiDeps } from "./deps.ts";
import { PageGlyph } from "./PageGlyph.tsx";

/** Pausa antes de recarregar depois de uma mudança (o salvamento automático emite muitos eventos seguidos). */
const RELOAD_DELAY_MS = 600;

/** "Mencionada em": as páginas que mencionam esta (ou a têm como subpágina no texto). Some quando não há nenhuma. */
export function Backlinks({
  deps,
  id,
  pages,
}: {
  deps: NotesUiDeps;
  id: string;
  pages: readonly NoteSummary[];
}) {
  const { service, events, actions } = deps;
  const [refs, setRefs] = useState<readonly PageRef[]>([]);

  const load = useCallback(() => {
    service.backlinks(id).then(setRefs, () => setRefs([]));
  }, [service, id]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(load, 0);
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(load, RELOAD_DELAY_MS);
    };
    const off = CHANGE_EVENTS.map((name) => events.on(name, schedule));
    return () => {
      clearTimeout(timer);
      off.forEach((unsubscribe) => unsubscribe());
    };
  }, [events, load]);

  if (refs.length === 0) return null;
  return (
    <section className="backlinks" aria-label="Mencionada em">
      <h2 className="backlinks__title">Mencionada em</h2>
      <ul className="backlinks__list">
        {refs.map((ref) => (
          <li key={ref.id}>
            <button
              type="button"
              className="backlinks__item"
              onClick={() => actions.openPage(ref.id, pages)}
            >
              <PageGlyph icon={ref.icon} isDatabase={ref.isDatabase} />
              <span>{ref.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
