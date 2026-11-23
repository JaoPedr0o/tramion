import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Note, VersionDetail, VersionSummary } from "../domain/note.ts";
import type { NotesUiDeps } from "./deps.ts";
import { messageFor } from "./messages.ts";
import { useNavigation } from "./useNavigation.ts";

const when = (ms: number) =>
  new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** A janela do histórico de versões: lista as versões antigas da página, mostra o texto da escolhida e restaura. */
export function VersionsDialog({ deps }: { deps: NotesUiDeps }) {
  const nav = useNavigation(deps.store);
  return nav.historyFor
    ? createPortal(<History deps={deps} noteId={nav.historyFor} />, document.body)
    : null;
}

type Loaded =
  | { status: "loading" }
  | { status: "ready"; note: Note; versions: readonly VersionSummary[] }
  | { status: "error" };

function History({ deps, noteId }: { deps: NotesUiDeps; noteId: string }) {
  const { service, store } = deps;
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [selected, setSelected] = useState<VersionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  // O foco vai para a janela ao abrir (para o Esc e o teclado funcionarem) e volta para onde estava ao fechar.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  // Salva o que estiver pendente no editor antes de listar, para o estado atual não ficar de fora.
  useEffect(() => {
    let current = true;
    (async () => {
      try {
        await store.flush();
        const [note, versions] = await Promise.all([
          service.get(noteId),
          service.listVersions(noteId),
        ]);
        if (current) setLoaded({ status: "ready", note, versions });
      } catch {
        if (current) setLoaded({ status: "error" });
      }
    })();
    return () => {
      current = false;
    };
  }, [service, store, noteId]);

  const choose = async (version: VersionSummary) => {
    try {
      setError(null);
      setSelected(await service.getVersion(version.id));
    } catch (failure) {
      setError(messageFor(failure));
    }
  };

  const restore = async () => {
    if (!selected || loaded.status !== "ready") return;
    try {
      setError(null);
      await service.restoreVersion({
        noteId,
        versionId: selected.id,
        expectedUpdatedAt: loaded.note.updatedAt,
      });
      store.closeHistory();
      store.reload();
      store.notify(
        `Versão de ${when(selected.savedAt)} restaurada. O estado anterior ficou no histórico.`,
      );
    } catch (failure) {
      setError(messageFor(failure));
    }
  };

  return (
    <div
      className="search-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) store.closeHistory();
      }}
    >
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Histórico de versões"
        className="versions"
        onKeyDown={(event) => event.key === "Escape" && store.closeHistory()}
      >
        <header className="versions__header">
          <h2 className="versions__title">Histórico de versões</h2>
          <button
            type="button"
            aria-label="Fechar o histórico"
            onClick={() => store.closeHistory()}
          >
            ×
          </button>
        </header>

        {loaded.status === "loading" && <p role="status">Carregando…</p>}
        {loaded.status === "error" && <p role="alert">Não foi possível carregar o histórico.</p>}
        {loaded.status === "ready" && loaded.versions.length === 0 && (
          <p className="versions__empty">
            Ainda não há versões antigas. Elas são guardadas conforme você edita a página.
          </p>
        )}

        {loaded.status === "ready" && loaded.versions.length > 0 && (
          <div className="versions__body">
            <ul className="versions__list" aria-label="Versões">
              {loaded.versions.map((version) => (
                <li key={version.id}>
                  <button
                    type="button"
                    className="versions__item"
                    aria-pressed={selected?.id === version.id}
                    onClick={() => void choose(version)}
                  >
                    <span className="versions__when">{when(version.savedAt)}</span>
                    <span className="versions__preview">{version.preview || "(sem texto)"}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="versions__detail">
              {selected ? (
                <>
                  <h3 className="versions__detail-title">{selected.title}</h3>
                  <pre className="versions__text">{selected.body || "(sem texto)"}</pre>
                  <button
                    type="button"
                    className="versions__restore"
                    onClick={() => void restore()}
                  >
                    Restaurar esta versão
                  </button>
                  <p className="popover__note">O estado atual fica guardado no histórico.</p>
                </>
              ) : (
                <p className="versions__empty">Escolha uma versão para ver o texto dela.</p>
              )}
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="notes-main__error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
