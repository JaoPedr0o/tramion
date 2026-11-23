import type { ComponentPropsWithRef, ReactNode } from "react";
import "./icon-button.css";

interface Props extends Omit<ComponentPropsWithRef<"button">, "children" | "aria-label"> {
  /** Nome acessível (e dica ao passar o mouse). Obrigatório: o botão só tem um ícone. */
  label: string;
  children: ReactNode;
}

/** Botão quadrado só com ícone, como os da barra lateral e da barra superior. */
export function IconButton({ label, children, className, ...rest }: Props) {
  return (
    <button
      type="button"
      className={["ui-icon-button", className].filter(Boolean).join(" ")}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}
