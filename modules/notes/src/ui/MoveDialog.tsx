import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { moveTargets } from "../application/page-tree.ts";
import type { NoteSummary } from "../domain/note.ts";

interface Props {
  pages: readonly NoteSummary[];
  pageId: string;
  /** `null` = a raiz. */
  onMove(newParentId: string | null): void;
  onClose(): void;
}

/**
 * Diálogo "Mover para…": um seletor com os destinos VÁLIDOS (sem a própria página nem suas descendentes, o
 * que evita ciclos já na tela; o Rust confere de novo). É a alternativa acessível a arrastar.
 * Modal: foco no seletor ao abrir, Tab preso dentro, Esc fecha e o foco volta para onde estava.
 */
export function MoveDialog({ pages, pageId, onMove, onClose }: Props) {
  const targets = moveTargets(pages, pageId);
  const current = pages.find((page) => page.id === pageId)?.parentId ?? null;
  const [choice, setChoice] = useState<string>(current ?? "");
  const dialog = useRef<HTMLDivElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const titleId = useId();
  const selectId = useId();

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    select.current?.focus();
    return () => before?.focus?.();
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>("select, button") ?? [])];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return createPortal(
    <div className="move-dialog__overlay" onClick={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="move-dialog"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="move-dialog__title">
          Mover página
        </h2>
        <label htmlFor={selectId}>Mover para</label>
        <select
          ref={select}
          id={selectId}
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          {targets.map((target) => (
            <option key={target.id ?? "raiz"} value={target.id ?? ""}>
              {`${"— ".repeat(target.depth)}${target.title}`}
            </option>
          ))}
        </select>
        <div className="move-dialog__buttons">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="move-dialog__confirm"
            onClick={() => onMove(choice === "" ? null : choice)}
          >
            Mover
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
