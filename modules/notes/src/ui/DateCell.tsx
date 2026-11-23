import { useMemo, useRef, useState } from "react";
import { datePart, joinDateTime, timePart } from "../application/date-time.ts";
import type { CellValue, Property } from "../domain/database.ts";
import { Popover } from "./Popover.tsx";
import { useSyncedDraft } from "./useSyncedDraft.ts";

interface Props {
  property: Property;
  /** Para o nome acessível: "Prazo — Comprar pão". */
  rowTitle: string;
  value: CellValue | undefined;
  /** Grava o valor (`AAAA-MM-DD` ou `AAAA-MM-DDTHH:MM`); `null` esvazia. */
  onChange(value: CellValue | null): void;
}

/** Janelinha para escolher a hora do prazo (opcional). */
function TimePopover({
  label,
  date,
  time,
  anchor,
  ignore,
  onPick,
  onClose,
}: {
  label: string;
  date: string;
  time: string | null;
  anchor: React.RefObject<HTMLElement | null>;
  ignore: ReadonlyArray<React.RefObject<HTMLElement | null>>;
  onPick(value: string): void;
  onClose(): void;
}) {
  const [draft, setDraft] = useState(time ?? "");
  return (
    <Popover
      label={label}
      className="popover--time"
      anchor={anchor}
      ignore={ignore}
      onClose={onClose}
    >
      <form
        className="time-form"
        onSubmit={(event) => {
          event.preventDefault();
          onPick(joinDateTime(date, draft));
          onClose();
        }}
      >
        <label className="time-form__field">
          <span>Hora do lembrete</span>
          <input
            type="time"
            aria-label="Hora"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <div className="time-form__actions">
          <button type="submit" className="dlg-btn dlg-btn--primary">
            Definir hora
          </button>
          {time !== null && (
            <button
              type="button"
              className="dlg-btn"
              onClick={() => {
                onPick(date);
                onClose();
              }}
            >
              Tirar a hora
            </button>
          )}
        </div>
      </form>
    </Popover>
  );
}

/** Célula de data: seletor do dia e, ao lado, um botão para escolher a hora (opcional). */
export function DateCell({ property, rowTitle, value, onChange }: Props) {
  const asText = typeof value === "string" ? value : "";
  const [draft, setDraft] = useSyncedDraft(datePart(asText));
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const ignore = useMemo(() => [anchor], []);
  const time = timePart(asText);
  const date = datePart(asText);
  const name = `${property.name} — ${rowTitle}`;

  return (
    <div className="date-cell" ref={anchor}>
      <input
        className="db-cell__input"
        aria-label={name}
        type="date"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          // O seletor de data já devolve uma data completa: grava na hora, mantendo a hora que já havia.
          onChange(event.target.value === "" ? null : joinDateTime(event.target.value, time));
        }}
      />
      {date !== "" && (
        <button
          type="button"
          className="dlg-btn date-cell__time"
          aria-label={time ? `Hora de ${name}: ${time}` : `Escolher a hora de ${name}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          {time ?? "Hora"}
        </button>
      )}
      {open && date !== "" && (
        <TimePopover
          label={`Hora de ${property.name}`}
          date={date}
          time={time}
          anchor={anchor}
          ignore={ignore}
          onPick={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
