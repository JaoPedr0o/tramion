import { useState, type FormEvent } from "react";
import type { Frequency, Habit, HabitInput } from "../domain/habit.ts";
import { Dialog } from "./Dialog.tsx";
import { messageFor } from "./messages.ts";

interface Props {
  /** Hábito em edição; sem ele, é um hábito novo. */
  habit: Habit | null;
  /** Grava; devolve se deu certo (o diálogo só fecha se der). */
  onSubmit: (input: HabitInput) => Promise<boolean>;
  onClose: () => void;
  error: Error | null;
}

const FREQUENCIES: ReadonlyArray<{ id: Frequency; label: string; hint: string }> = [
  { id: "daily", label: "Todo dia", hint: "Sete dias por semana" },
  { id: "weekdays", label: "Dias úteis (segunda a sexta)", hint: "Sábado e domingo são folga" },
  { id: "weekly", label: "Algumas vezes por semana", hint: "Você escolhe quantas" },
];

/** Sugestões de símbolo (um toque preenche o campo; dá para digitar qualquer emoji). */
const SUGGESTED_ICONS = ["💧", "📖", "🏃", "🧘", "🥗", "😴", "✍️", "🎸"];

/** Janela para criar ou editar um hábito. */
export function HabitDialog({ habit, onSubmit, onClose, error }: Props) {
  const [name, setName] = useState(habit?.name ?? "");
  const [icon, setIcon] = useState(habit?.icon ?? "");
  const [frequency, setFrequency] = useState<Frequency>(habit?.frequency ?? "daily");
  const [times, setTimes] = useState(String(habit?.timesPerWeek ?? 3));
  const [busy, setBusy] = useState(false);

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

  return (
    <Dialog
      title={habit ? "Editar hábito" : "Novo hábito"}
      subtitle={
        habit ? undefined : "Um passo pequeno por dia. Você marca quando fizer, sem cobrança."
      }
      onClose={onClose}
      onSubmit={(event) => void submit(event)}
      footer={
        <>
          <button type="button" className="focus-btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="focus-btn focus-btn--primary" disabled={busy}>
            Salvar
          </button>
        </>
      }
    >
      <label className="focus-field">
        <span>Nome</span>
        <input
          value={name}
          maxLength={100}
          placeholder="Ler 20 minutos"
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <div className="focus-field">
        <label htmlFor="focus-habit-icon">Símbolo (opcional)</label>
        <input
          id="focus-habit-icon"
          value={icon}
          maxLength={16}
          placeholder="Um emoji, se quiser"
          onChange={(event) => setIcon(event.target.value)}
        />
        <div className="focus-chips" role="group" aria-label="Sugestões de símbolo">
          {SUGGESTED_ICONS.map((symbol) => (
            <button
              key={symbol}
              type="button"
              className="focus-chip"
              aria-pressed={icon === symbol}
              aria-label={`Usar o símbolo ${symbol}`}
              onClick={() => setIcon(icon === symbol ? "" : symbol)}
            >
              <span aria-hidden="true">{symbol}</span>
            </button>
          ))}
        </div>
      </div>

      <fieldset className="focus-fieldset">
        <legend>Frequência</legend>
        {FREQUENCIES.map((option) => (
          <label key={option.id} className="focus-choice" data-checked={frequency === option.id}>
            <input
              type="radio"
              name="focus-frequency"
              aria-label={option.label}
              checked={frequency === option.id}
              onChange={() => setFrequency(option.id)}
            />
            <span className="focus-choice__text">
              <span className="focus-choice__label">{option.label}</span>
              <span className="focus-choice__hint">{option.hint}</span>
            </span>
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
    </Dialog>
  );
}
