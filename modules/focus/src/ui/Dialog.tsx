import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled])";

interface Props {
  title: string;
  /** Texto curto sob o título (opcional). */
  subtitle?: string | undefined;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  /** Botões do rodapé fixo. */
  footer: ReactNode;
  children: ReactNode;
}

/**
 * Janela do módulo: cabeçalho e rodapé fixos, só o miolo rola; no celular vira folha de tela cheia. Foco preso dentro
 * dela, Esc fecha, clicar fora fecha, e o foco volta para onde estava ao fechar.
 */
export function Dialog({ title, subtitle, onClose, onSubmit, footer, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current
      ?.querySelector(".focus-dialog__body")
      ?.querySelector<HTMLElement>(FOCUSABLE)
      ?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !box.current) return;
    const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="focus-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="focus-dialog"
        onKeyDown={onKeyDown}
      >
        <form className="focus-dialog__form" onSubmit={onSubmit}>
          <header className="focus-dialog__header">
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </header>
          <div className="focus-dialog__body">{children}</div>
          <footer className="focus-dialog__footer">{footer}</footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
