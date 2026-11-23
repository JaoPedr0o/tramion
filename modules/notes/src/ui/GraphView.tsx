import { CHANGE_EVENTS } from "../application/change-events.ts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { layoutGraph } from "../application/graph-layout.ts";
import type { PageGraph } from "../domain/note.ts";
import type { NotesUiDeps } from "./deps.ts";
import { usePages } from "./useNoteList.ts";

const WIDTH = 900;
const HEIGHT = 600;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;

type State = { status: "loading" } | { status: "ready"; graph: PageGraph } | { status: "error" };

/**
 * O grafo de conexões: cada página é um ponto; linhas cheias são menções e subpáginas escritas no texto, tracejadas são a
 * hierarquia. Clicar (ou Enter) abre a página; arrastar move o desenho; a roda e os botões aproximam e afastam.
 */
export function GraphView({ deps }: { deps: NotesUiDeps }) {
  const { service, events, actions } = deps;
  const pages = usePages(service, events);
  const list = pages.status === "ready" ? pages.items : [];
  const [state, setState] = useState<State>({ status: "loading" });
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const load = useCallback(() => {
    service.graph().then(
      (graph) => setState({ status: "ready", graph }),
      () => setState({ status: "error" }),
    );
  }, [service]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const off = CHANGE_EVENTS.map((name) => events.on(name, load));
    return () => {
      clearTimeout(first);
      off.forEach((unsubscribe) => unsubscribe());
    };
  }, [events, load]);

  const graph = state.status === "ready" ? state.graph : null;
  // O desenho só é recalculado quando as páginas ou as ligações mudam (não a cada passada do mouse).
  const signature = graph
    ? `${graph.nodes.map((n) => n.id).join(",")}|${graph.edges.map((e) => `${e.from}>${e.to}`).join(",")}`
    : "";
  const positions = useMemo(
    () => (graph ? layoutGraph(graph.nodes, graph.edges, WIDTH, HEIGHT) : new Map()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a assinatura resume o grafo
    [signature],
  );

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of graph?.edges ?? []) {
      (map.get(edge.from) ?? map.set(edge.from, new Set()).get(edge.from)!).add(edge.to);
      (map.get(edge.to) ?? map.set(edge.to, new Set()).get(edge.to)!).add(edge.from);
    }
    return map;
  }, [graph]);

  const zoom = (factor: number) =>
    setView((v) => ({ ...v, k: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor)) }));
  const isDim = (id: string) => hover !== null && hover !== id && !neighbors.get(hover)?.has(id);

  if (state.status === "loading")
    return (
      <p role="status" className="notes-main__placeholder">
        Carregando…
      </p>
    );
  if (state.status === "error")
    return (
      <p role="alert" className="notes-main__error">
        Não foi possível montar o grafo agora.
      </p>
    );

  return (
    <section className="graph" aria-labelledby="graph-title">
      <div className="graph__bar">
        <h1 id="graph-title" className="graph__title">
          Grafo
        </h1>
        <div className="graph__controls">
          <button type="button" aria-label="Aproximar" onClick={() => zoom(1.25)}>
            +
          </button>
          <button type="button" aria-label="Afastar" onClick={() => zoom(0.8)}>
            −
          </button>
          <button type="button" onClick={() => setView({ x: 0, y: 0, k: 1 })}>
            Ajustar à tela
          </button>
        </div>
      </div>

      {state.graph.nodes.length === 0 ? (
        <p className="graph__empty">Ainda não há páginas.</p>
      ) : (
        <>
          {state.graph.edges.length === 0 && (
            <p className="graph__empty">
              Ainda não há conexões. Mencione outra página com @ ou crie subpáginas para ver o mapa
              se formar.
            </p>
          )}
          <svg
            className="graph__canvas"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="group"
            aria-label="Grafo de conexões entre as páginas"
            onWheel={(event) => zoom(event.deltaY < 0 ? 1.1 : 0.9)}
            onPointerDown={(event) => {
              drag.current = { x: event.clientX, y: event.clientY, moved: false };
            }}
            onPointerMove={(event) => {
              const start = drag.current;
              if (!start) return;
              const dx = event.clientX - start.x;
              const dy = event.clientY - start.y;
              if (Math.abs(dx) + Math.abs(dy) > 3) start.moved = true;
              if (start.moved) {
                setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
                start.x = event.clientX;
                start.y = event.clientY;
              }
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerLeave={() => {
              drag.current = null;
            }}
          >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {state.graph.edges.map((edge) => {
                const a = positions.get(edge.from);
                const b = positions.get(edge.to);
                if (!a || !b) return null;
                const dim = hover !== null && hover !== edge.from && hover !== edge.to;
                return (
                  <line
                    key={`${edge.kind}:${edge.from}:${edge.to}`}
                    className={`graph__edge graph__edge--${edge.kind}${dim ? " graph__edge--dim" : ""}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                  />
                );
              })}
              {state.graph.nodes.map((node) => {
                const at = positions.get(node.id);
                if (!at) return null;
                const open = () => {
                  if (!drag.current?.moved) actions.openPage(node.id, list);
                };
                return (
                  <g
                    key={node.id}
                    className={`graph__node${node.isDatabase ? " graph__node--database" : ""}${isDim(node.id) ? " graph__node--dim" : ""}`}
                    transform={`translate(${at.x} ${at.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={node.title}
                    onClick={open}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        actions.openPage(node.id, list);
                      }
                    }}
                    onPointerEnter={() => setHover(node.id)}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover(node.id)}
                    onBlur={() => setHover(null)}
                  >
                    <circle r={node.isDatabase ? 8 : 6} />
                    <text y={-12} textAnchor="middle">
                      {node.title}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
          <p className="graph__legend">
            <span className="graph__swatch graph__swatch--link" /> menção ou subpágina no texto{" "}
            <span className="graph__swatch graph__swatch--child" /> hierarquia
          </p>
        </>
      )}
    </section>
  );
}
