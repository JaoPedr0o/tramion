import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NotesUiDeps } from "./deps.ts";
import { usePages } from "./useNoteList.ts";
import { useNavigation } from "./useNavigation.ts";

/**
 * A janelinha de captura rápida: digite uma ideia (a primeira linha é o título) e `Ctrl + Enter` guarda na Caixa de
 * entrada, sem sair do que você estava fazendo. Abre pelo atalho `Ctrl + Alt + N`, pelo botão da barra lateral e pelo
 * item "Captura rápida" da bandeja do sistema.
 */
export function QuickCaptureDialog({ deps }: { deps: NotesUiDeps }) {
  const nav = useNavigation(deps.store);
  return nav.captureOpen ? createPortal(<Capture deps={deps} />, document.body) : null;
}

function Capture({ deps }: { deps: NotesUiDeps }) {
  const { store, actions, service, events } = deps;
  const pages = usePages(service, events);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  // O foco vai para o campo ao abrir e volta para onde estava ao fechar.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    field.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  const save = async () => {
    if (saving || text.trim() === "") return;
    setSaving(true);
    const ok = await actions.quickCapture(text, pages.status === "ready" ? pages.items : []);
    setSaving(false);
    if (ok) store.closeCapture();
  };

  return (
    <div
      className="search-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) store.closeCapture();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Captura rápida"
        className="capture capture--quick"
      >
        <h2 className="capture__title">Captura rápida</h2>
        <p className="capture__lead">
          A primeira linha vira o título. O texto é guardado na Caixa de entrada.
        </p>
        <textarea
          ref={field}
          aria-label="Texto da captura"
          placeholder="Anote uma ideia…"
          value={text}
          rows={6}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              store.closeCapture();
            } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void save();
            }
          }}
        />
        <div className="capture__bar">
          <span className="capture__hint capture__hint--keys">Ctrl + Enter para guardar</span>
          <div className="capture__actions">
            <button type="button" className="dlg-btn" onClick={() => store.closeCapture()}>
              Cancelar
            </button>
            <button
              type="button"
              className="dlg-btn dlg-btn--primary"
              disabled={saving || text.trim() === ""}
              onClick={() => void save()}
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
