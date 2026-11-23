import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

interface Props {
  label: string;
  onClose(): void;
  /** Elementos que NÃO contam como "fora" ao clicar (o botão que abriu a janela). */
  ignore?: ReadonlyArray<RefObject<HTMLElement | null>>;
  /**
   * Quando informado, a janela é desenhada fora da área atual (em `document.body`, posição fixa) logo abaixo
   * deste elemento: assim não é cortada por tabelas ou listas com rolagem. Sem ele, fica relativa ao pai.
   */
  anchor?: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
}

const GAP = 4;
const MARGIN = 8;
const ESTIMATED_WIDTH = 340;
const ESTIMATED_HEIGHT = 300;

function placeBelow(anchor: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - ESTIMATED_WIDTH - MARGIN));
  const fitsBelow = rect.bottom + GAP + ESTIMATED_HEIGHT <= window.innerHeight;
  return fitsBelow
    ? { position: "fixed", top: rect.bottom + GAP, left }
    : { position: "fixed", bottom: window.innerHeight - rect.top + GAP, left };
}

/**
 * Janelinha ancorada (não modal): foco no primeiro campo ao abrir, Esc e clique fora fecham. Clicar dentro de
 * outra janelinha (por exemplo, a lista de um seletor aberto por ela) não conta como "fora".
 */
export function Popover({ label, onClose, ignore = [], anchor, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);

  useLayoutEffect(() => {
    if (!anchor?.current) return;
    const place = () => setStyle(placeBelow(anchor.current!));
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input, button")?.focus();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      if (ignore.some((other) => other.current?.contains(target))) return;
      if ((target as Element).closest?.("[data-popover]")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose, ignore]);

  const content = (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      data-popover=""
      className={["popover", anchor ? "popover--floating" : "", className]
        .filter(Boolean)
        .join(" ")}
      style={style}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {children}
    </div>
  );

  if (!anchor) return content;
  // Só desenha depois de calcular a posição, para não piscar no canto da tela.
  return style ? createPortal(content, document.body) : null;
}
