import { useMemo, useRef, useState } from "react";
import { Popover } from "./Popover.tsx";

export interface ChoiceOption {
  readonly id: string;
  readonly label: string;
}

interface Props {
  /** Nome acessível do botão e da lista. */
  label: string;
  value: string;
  options: readonly ChoiceOption[];
  onChange(id: string): void;
  /** Texto do botão quando `value` não está nas opções. */
  placeholder?: string;
}

/**
 * Escolha única numa lista: um botão que abre uma janelinha com as opções. Existe no lugar do `<select>` nativo
 * porque a lista nativa não abre de forma confiável dentro do webview de todos os sistemas.
 */
export function Choice({ label, value, options, onChange, placeholder = "Escolher…" }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const ignore = useMemo(() => [anchor], []);
  const current = options.find((option) => option.id === value);

  return (
    <span className="choice" ref={anchor}>
      <button
        type="button"
        className="choice__button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        {current ? current.label : placeholder}
      </button>
      {open && (
        <Popover
          label={label}
          className="popover--list"
          anchor={anchor}
          onClose={() => setOpen(false)}
          ignore={ignore}
        >
          <div role="listbox" aria-label={label} className="choice__list">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === value}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </span>
  );
}
