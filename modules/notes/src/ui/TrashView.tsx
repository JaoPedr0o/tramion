import { PageIcon } from "@tramion/ui";
import { useState } from "react";
import type { NotesUiDeps } from "./deps.ts";
import { subpagesText } from "./format.ts";
import { messageFor } from "./messages.ts";
import { useTrash } from "./useNoteList.ts";

/**
 * Lixeira como tela própria: só as RAÍZES de cada exclusão, com a contagem de subpáginas. Restaurar traz de
 * volta a página e o que foi excluído junto; apagar de vez pede confirmação e avisa o que leva junto.
 */
export function TrashView({
  service,
  events,
  store,
}: Pick<NotesUiDeps, "service" | "events" | "store">) {
  const trash = useTrash(service, events);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setConfirmingId(null);
    } catch (error) {
      store.fail(messageFor(error));
    }
  };

  return (
    <section className="trash-view" aria-labelledby="trash-title">
      <h1 id="trash-title" className="trash-view__title">
        Lixeira
      </h1>

      {trash.status === "loading" && <p role="status">Carregando…</p>}
      {trash.status === "error" && <p role="alert">Não foi possível carregar a lixeira.</p>}
      {trash.status === "ready" && trash.items.length === 0 && (
        <p className="notes-main__placeholder">A lixeira está vazia.</p>
      )}

      {trash.status === "ready" && trash.items.length > 0 && (
        <ul className="trash-view__list" aria-label="Páginas na lixeira">
          {trash.items.map((item) => (
            <li key={item.id} className="trash-view__item">
              <span className="sidebar-row__icon" aria-hidden="true">
                <PageIcon />
              </span>
              <span className="trash-view__name">{item.title}</span>
              {item.descendantCount > 0 && (
                <span className="trash-view__meta">{subpagesText(item.descendantCount)}</span>
              )}

              {confirmingId === item.id ? (
                <span className="trash-view__actions">
                  <span className="trash-view__warning">
                    Isto não pode ser desfeito.
                    {item.descendantCount > 0
                      ? ` Também apagará ${subpagesText(item.descendantCount)}.`
                      : ""}
                  </span>
                  <button
                    type="button"
                    className="trash-view__danger"
                    onClick={() => run(() => service.purge(item.id))}
                  >
                    Confirmar
                  </button>
                  <button type="button" onClick={() => setConfirmingId(null)}>
                    Cancelar
                  </button>
                </span>
              ) : (
                <span className="trash-view__actions">
                  <button
                    type="button"
                    aria-label={`Restaurar ${item.title}`}
                    onClick={() => run(() => service.restore(item.id))}
                  >
                    Restaurar
                  </button>
                  <button
                    type="button"
                    aria-label={`Apagar ${item.title} de vez`}
                    onClick={() => setConfirmingId(item.id)}
                  >
                    Apagar de vez
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
