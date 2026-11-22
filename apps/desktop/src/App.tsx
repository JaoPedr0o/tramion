import type { ViewRegistry } from "@aun/contracts";
import { useState } from "react";

/** Casca do app: barra lateral com as telas dos módulos e a área principal. */
export default function App({ views }: { views: ViewRegistry }) {
  const available = views.list();
  const [selectedId, setSelectedId] = useState(available[0]?.id);
  const selected = available.find((view) => view.id === selectedId);
  const Selected = selected?.component;

  return (
    <div className="shell">
      <nav className="shell__sidebar" aria-label="Principal">
        <ul className="shell__nav">
          {available.map((view) => (
            <li key={view.id}>
              <button
                type="button"
                className="shell__nav-button"
                aria-current={view.id === selectedId ? "page" : undefined}
                onClick={() => setSelectedId(view.id)}
              >
                {view.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <main className="shell__content">
        {Selected ? <Selected /> : <p className="shell__empty">Nenhum módulo carregado.</p>}
      </main>
    </div>
  );
}
