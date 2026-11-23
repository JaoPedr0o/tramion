import { SearchIcon } from "@tramion/ui";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { SearchHit } from "../domain/note.ts";
import type { NotesUiDeps } from "./deps.ts";
import { PageGlyph } from "./PageGlyph.tsx";
import { usePages } from "./useNoteList.ts";

/** Pausa depois da última tecla antes de buscar (evita uma busca por letra digitada). */
const DEBOUNCE_MS = 120;

type Results =
  | { status: "idle" }
  | { status: "ready"; query: string; hits: readonly SearchHit[] }
  | { status: "error" };

/**
 * A caixa de busca global (Ctrl + K): digita, as setas escolhem, Enter abre, Esc fecha. Procura no título e no texto
 * das páginas, sem diferenciar acento nem maiúscula. Só existe na tela enquanto aberta.
 */
export function SearchDialog({ deps }: { deps: NotesUiDeps }) {
  const open = useSyncExternalStore(deps.search.subscribe, deps.search.isOpen);
  return open ? createPortal(<SearchBox deps={deps} />, document.body) : null;
}

function SearchBox({ deps }: { deps: NotesUiDeps }) {
  const { service, events, actions, search } = deps;
  const pages = usePages(service, events);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>({ status: "idle" });
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Devolve o foco a quem o tinha antes de abrir.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  // Busca com pausa; respostas que chegam fora de ordem são descartadas.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === "") return;
    let current = true;
    const timer = setTimeout(() => {
      service.search(trimmed).then(
        (hits) => {
          if (!current) return;
          setResults({ status: "ready", query: trimmed, hits });
          setActive(0);
        },
        () => current && setResults({ status: "error" }),
      );
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, service]);

  const hits = results.status === "ready" && query.trim() !== "" ? results.hits : [];
  const waiting =
    query.trim() !== "" && !(results.status === "ready" && results.query === query.trim());

  const choose = (hit: SearchHit) => {
    search.close();
    actions.openPage(hit.id, pages.status === "ready" ? pages.items : []);
  };

  return (
    <div
      className="search-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) search.close();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Buscar" className="search-box">
        <div className="search-box__field">
          <SearchIcon />
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-label="Buscar páginas"
            aria-expanded={hits.length > 0}
            aria-controls={listId}
            aria-activedescendant={hits[active] ? `${listId}-${active}` : undefined}
            placeholder="Buscar em todas as páginas…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                search.close();
              } else if (event.key === "ArrowDown" && hits.length > 0) {
                event.preventDefault();
                setActive((index) => (index + 1) % hits.length);
              } else if (event.key === "ArrowUp" && hits.length > 0) {
                event.preventDefault();
                setActive((index) => (index - 1 + hits.length) % hits.length);
              } else if (event.key === "Enter" && hits[active]) {
                event.preventDefault();
                choose(hits[active]);
              }
            }}
          />
        </div>

        <ul id={listId} role="listbox" aria-label="Resultados" className="search-box__list">
          {hits.map((hit, index) => (
            <li
              key={hit.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className="search-box__item"
              onMouseMove={() => setActive(index)}
              onClick={() => choose(hit)}
            >
              <span className="search-box__glyph" aria-hidden="true">
                <PageGlyph icon={hit.icon} isDatabase={hit.isDatabase} />
              </span>
              <span className="search-box__text">
                <span className="search-box__title">{hit.title}</span>
                {hit.snippet !== "" && <span className="search-box__snippet">{hit.snippet}</span>}
              </span>
            </li>
          ))}
        </ul>

        {query.trim() === "" && (
          <p className="search-box__note">Digite para buscar no título e no texto.</p>
        )}
        {results.status === "error" && query.trim() !== "" && (
          <p role="alert" className="search-box__note">
            Não foi possível buscar agora.
          </p>
        )}
        {!waiting && results.status === "ready" && query.trim() !== "" && hits.length === 0 && (
          <p className="search-box__note">Nenhuma página encontrada.</p>
        )}
      </div>
    </div>
  );
}
