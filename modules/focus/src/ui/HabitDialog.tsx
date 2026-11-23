import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { Frequency, Habit, HabitInput } from "../domain/habit.ts";
import { messageFor } from "./messages.ts";

interface Props {
  /** Hábito em edição; sem ele, é um hábito novo. */
  habit: Habit | null;
  /** Grava; devolve se deu certo (o diálogo só fecha se der). */
  onSubmit: (input: HabitInput) => Promise<boolean>;
  onClose: () => void;
  error: Error | null;
}

const FREQUENCIES: ReadonlyArray<{ id: Frequency; label: string }> = [
  { id: "daily", label: "Todo dia" },
  { id: "weekdays", label: "Dias úteis (segunda a sexta)" },
  { id: "weekly", label: "Algumas vezes por semana" },
];

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled])";

/** Janela para criar ou editar um hábito: cabeçalho e rodapé fixos, só o miolo rola; no celular ocupa a tela. */
export function HabitDialog({ habit, onSubmit, onClose, error }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(habit?.name ?? "");
  const [icon, setIcon] = useState(habit?.icon ?? "");
  const [frequency, setFrequency] = useState<Frequency>(habit?.frequency ?? "daily");
  const [times, setTimes] = useState(String(habit?.timesPerWeek ?? 3));
  const [busy, setBusy] = useState(false);

  // O foco vai para o nome ao abrir e volta para onde estava ao fechar.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    nameField.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const ok = await onSubmit({
      name,
      icon: icon.trim() === "" ? null : icon.trim(),
      frequency,
      timesPerWeek: frequency === "weekly" ? Number(times) : null,
    });
    setBusy(false);
    if (ok) onClose();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !box.current) return;
    // Mantém o Tab dentro da janela.
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

  const title = habit ? "Editar hábito" : "Novo hábito";

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
        aria-labelledby="focus-habit-dialog-title"
        className="focus-dialog"
        onKeyDown={onKeyDown}
      >
        <form className="focus-dialog__form" onSubmit={(event) => void submit(event)}>
          <header className="focus-dialog__header">
            <h2 id="focus-habit-dialog-title">{title}</h2>
          </header>

          <div className="focus-dialog__body">
            <label className="focus-field">
              <span>Nome</span>
              <input
                ref={nameField}
                value={name}
                maxLength={100}
                placeholder="Ler 20 minutos"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="focus-field">
              <span>Símbolo (opcional)</span>
              <input
                value={icon}
                maxLength={16}
                placeholder="Um emoji, se quiser"
                onChange={(event) => setIcon(event.target.value)}
              />
            </label>
            <fieldset className="focus-fieldset">
              <legend>Frequência</legend>
              {FREQUENCIES.map((option) => (
                <label key={option.id} className="focus-check">
                  <input
                    type="radio"
                    name="focus-frequency"
                    checked={frequency === option.id}
                    onChange={() => setFrequency(option.id)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
            {frequency === "weekly" ? (
              <label className="focus-field">
                <span>Vezes por semana</span>
                <select value={times} onChange={(event) => setTimes(event.target.value)}>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {error ? (
              <p role="alert" className="focus-error">
                {messageFor(error)}
              </p>
            ) : null}
          </div>

          <footer className="focus-dialog__footer">
            <button type="button" className="focus-btn" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="focus-btn focus-btn--primary" disabled={busy}>
              Salvar
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
