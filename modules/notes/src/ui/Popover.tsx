import { useEffect, useRef, type ReactNode, type RefObject } from "react";

interface Props {
  label: string;
  onClose(): void;
  /** Elementos que NÃO contam como "fora" ao clicar (o botão que abriu a janela). */
  ignore?: ReadonlyArray<RefObject<HTMLElement | null>>;
  className?: string;
  children: ReactNode;
}

/**
 * Janelinha ancorada ao conteúdo (não modal): foco no primeiro campo ao abrir, Esc e clique fora fecham.
 * Quem a abre decide onde ela fica (posição relativa ao pai).
 */
export function Popover({ label, onClose, ignore = [], className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input, button")?.focus();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      if (ignore.some((anchor) => anchor.current?.contains(target))) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose, ignore]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={["popover", className].filter(Boolean).join(" ")}
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
}
