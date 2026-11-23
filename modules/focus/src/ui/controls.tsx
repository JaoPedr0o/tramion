import { useId, type ReactNode } from "react";
import { MinusIcon, PlusIcon } from "./icons.tsx";

interface StepperProps {
  label: string;
  /** Texto curto antes do rótulo nos botões ("Diminuir foco"). */
  short: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}

/** Número com − e +: alvos de 44 px, e o campo continua aceitando digitação. */
export function Stepper({ label, short, value, min, max, unit, onChange }: StepperProps) {
  const id = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  return (
    <div className="focus-stepper">
      <label htmlFor={id} className="focus-stepper__label">
        {label}
      </label>
      <div className="focus-stepper__box">
        <button
          type="button"
          className="focus-stepper__btn"
          aria-label={`Diminuir ${short}`}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - 1))}
        >
          <MinusIcon />
        </button>
        <input
          id={id}
          className="focus-stepper__input"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={Number.isNaN(value) ? "" : value}
          onChange={(event) =>
            onChange(event.target.value === "" ? NaN : Number(event.target.value))
          }
        />
        <span className="focus-stepper__unit" aria-hidden="true">
          {unit}
        </span>
        <button
          type="button"
          className="focus-stepper__btn"
          aria-label={`Aumentar ${short}`}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + 1))}
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}

interface SwitchProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Botão extra à direita (ex.: "Ouvir"). */
  extra?: ReactNode;
}

/** Interruptor (role=switch) com rótulo e dica; a linha inteira é o alvo de toque. */
export function Switch({ label, hint, checked, onChange, extra }: SwitchProps) {
  const id = useId();
  return (
    <div className="focus-switch">
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="focus-switch__main"
        onClick={() => onChange(!checked)}
      >
        <span className="focus-switch__text">
          <span className="focus-switch__label">{label}</span>
          {hint ? (
            <span className="focus-switch__hint" id={`${id}-hint`}>
              {hint}
            </span>
          ) : null}
        </span>
        <span className="focus-switch__track" aria-hidden="true">
          <span className="focus-switch__thumb" />
        </span>
      </button>
      {extra}
    </div>
  );
}
