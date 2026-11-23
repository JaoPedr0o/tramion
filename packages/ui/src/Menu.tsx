import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./IconButton.tsx";
import "./menu.css";

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  /** Ação destrutiva: aparece em vermelho. */
  readonly danger?: boolean;
  readonly disabled?: boolean;
  onSelect(): void;
}

interface Props {
  /** Nome acessível do botão que abre o menu (e do próprio menu). */
  label: string;
  /** Ícone do botão. */
  icon: ReactNode;
  items: readonly MenuItem[];
  /** De que lado o menu se alinha ao botão (padrão: pela direita). */
  align?: "start" | "end";
  className?: string;
  /** `-1` tira o botão da ordem do Tab (útil quando o menu repete ações disponíveis em outro lugar). */
  tabIndex?: number;
}

interface Position {
  top: number;
  left?: number;
  right?: number;
}

const ITEMS = '[role="menuitem"]:not(:disabled)';

/**
 * Menu "⋯" acessível. O botão tem `aria-haspopup` e `aria-expanded`; o menu abre com o foco no
 * primeiro item e se fecha com Esc (devolvendo o foco ao botão), Tab, clique fora ou rolagem.
 * Setas, Home e End percorrem os itens.
 *
 * O menu é desenhado num portal em `document.body`, em posição fixa: assim não é cortado pelas
 * áreas com rolagem (a barra lateral). Como eventos de portais "sobem" pela árvore do React, cliques e
 * teclas do menu são contidos aqui: não podem selecionar a linha da árvore que está por baixo.
 */
export function Menu({ label, icon, items, align = "end", className, tabIndex }: Props) {
  const [position, setPosition] = useState<Position | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = position !== null;

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>(ITEMS)?.focus();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) {
        setPosition(null);
      }
    };
    const dismiss = () => setPosition(null);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  const openMenu = () => {
    const rect = trigger.current!.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4,
      ...(align === "end" ? { right: window.innerWidth - rect.right } : { left: rect.left }),
    });
  };

  const close = () => {
    setPosition(null);
    trigger.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation(); // nada do menu pode chegar à árvore ou à tela por baixo
    const list = [...(menu.current?.querySelectorAll<HTMLButtonElement>(ITEMS) ?? [])];
    const index = list.indexOf(document.activeElement as HTMLButtonElement);

    switch (event.key) {
      case "ArrowDown":
        list[(index + 1) % list.length]?.focus();
        break;
      case "ArrowUp":
        list[(index - 1 + list.length) % list.length]?.focus();
        break;
      case "Home":
        list[0]?.focus();
        break;
      case "End":
        list.at(-1)?.focus();
        break;
      case "Escape":
        close();
        break;
      case "Tab":
        setPosition(null); // o Tab segue o seu caminho normal
        return;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <>
      <IconButton
        ref={trigger}
        label={label}
        className={className}
        {...(tabIndex === undefined ? {} : { tabIndex })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (open) setPosition(null);
          else openMenu();
        }}
      >
        {icon}
      </IconButton>

      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={label}
            className="ui-menu"
            style={position}
            onKeyDown={onKeyDown}
            onClick={(event) => event.stopPropagation()}
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={item.danger ? "ui-menu__item ui-menu__item--danger" : "ui-menu__item"}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                <span className="ui-menu__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
