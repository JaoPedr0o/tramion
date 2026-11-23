import { useMemo, useRef, useState } from "react";
import {
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  addMonths,
  groupByDate,
  longDate,
  monthGrid,
  monthLabel,
  monthOf,
  todayIso,
  type IsoDate,
  type MonthCursor,
} from "../application/calendar.ts";
import type { DatabaseRow, Property } from "../domain/database.ts";
import { PageGlyph } from "./PageGlyph.tsx";
import { Popover } from "./Popover.tsx";
import { useSyncedDraft } from "./useSyncedDraft.ts";

interface Props {
  /** A coluna de data que posiciona as linhas no calendário. */
  dateProperty: Property;
  rows: readonly DatabaseRow[];
  onOpen(rowId: string): void;
  /** Muda a data de uma linha (`null` = tirar a data). */
  onMoveDate(rowId: string, iso: IsoDate | null): void;
  /** Cria uma linha nova já na data indicada. */
  onAdd(iso: IsoDate): void;
  /** O dia de "hoje" (os testes passam um fixo). */
  today?: IsoDate;
}

/** Mudar a data por um seletor: alternativa ao arrastar, para teclado e leitores de tela. */
function ChangeDateButton({
  row,
  current,
  onChange,
}: {
  row: DatabaseRow;
  current: IsoDate | null;
  onChange(iso: IsoDate | null): void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useSyncedDraft(current ?? "");
  const anchor = useRef<HTMLSpanElement>(null);
  const ignore = useMemo(() => [anchor], []);
  return (
    <span className="calendar__change" ref={anchor}>
      <button
        type="button"
        className="calendar__change-button"
        aria-label={`Mudar a data de ${row.title}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        ⋯
      </button>
      {open && (
        <Popover
          label={`Data de ${row.title}`}
          anchor={anchor}
          ignore={ignore}
          onClose={() => setOpen(false)}
        >
          <div className="db-form">
            <input
              type="date"
              aria-label="Nova data"
              value={draft}
              onChange={(event) => {
                // O campo vai se preenchendo por partes (dia, mês, ano): só grava quando a data está completa.
                setDraft(event.target.value);
                if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) {
                  onChange(event.target.value);
                  setOpen(false);
                }
              }}
            />
            {current && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Tirar a data
              </button>
            )}
          </div>
        </Popover>
      )}
    </span>
  );
}

/** O calendário do mês: cada linha aparece no dia da coluna de data; arrastar muda a data. */
export function DatabaseCalendar({ dateProperty, rows, onOpen, onMoveDate, onAdd, today }: Props) {
  const todayDate = today ?? todayIso();
  const [cursor, setCursor] = useState<MonthCursor>(() => monthOf(todayDate));
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<IsoDate | null>(null);

  const weeks = useMemo(() => monthGrid(cursor), [cursor]);
  const { byDate, undated } = useMemo(
    () => groupByDate(rows, dateProperty.id),
    [rows, dateProperty],
  );

  const item = (row: DatabaseRow, iso: IsoDate | null) => (
    <li
      key={row.id}
      className="calendar__item"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", row.id);
        event.dataTransfer.effectAllowed = "move";
        setDragging(row.id);
      }}
      onDragEnd={() => {
        setDragging(null);
        setOver(null);
      }}
    >
      <button type="button" className="calendar__open" onClick={() => onOpen(row.id)}>
        <PageGlyph icon={row.icon} size={14} />
        <span>{row.title}</span>
      </button>
      <ChangeDateButton row={row} current={iso} onChange={(next) => onMoveDate(row.id, next)} />
    </li>
  );

  const label = monthLabel(cursor);
  return (
    <div className="calendar">
      <div className="calendar__bar">
        <button
          type="button"
          aria-label="Mês anterior"
          onClick={() => setCursor((current) => addMonths(current, -1))}
        >
          ‹
        </button>
        <h2 className="calendar__title" aria-live="polite">
          {label}
        </h2>
        <button
          type="button"
          aria-label="Próximo mês"
          onClick={() => setCursor((current) => addMonths(current, 1))}
        >
          ›
        </button>
        <button type="button" onClick={() => setCursor(monthOf(todayDate))}>
          Hoje
        </button>
      </div>

      <table className="calendar__grid" aria-label={`Calendário de ${label}`}>
        <thead>
          <tr>
            {WEEKDAY_SHORT.map((short, index) => (
              <th scope="col" key={short} abbr={WEEKDAY_NAMES[index]}>
                {short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]!.iso}>
              {week.map((day) => (
                <td
                  key={day.iso}
                  aria-label={longDate(day.iso)}
                  className={[
                    "calendar__day",
                    day.inMonth ? "" : "calendar__day--outside",
                    day.iso === todayDate ? "calendar__day--today" : "",
                    over === day.iso ? "calendar__day--over" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onDragOver={(event) => {
                    if (dragging === null) return;
                    event.preventDefault();
                    setOver(day.iso);
                  }}
                  onDragLeave={() => setOver((current) => (current === day.iso ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragging !== null) onMoveDate(dragging, day.iso);
                    setDragging(null);
                    setOver(null);
                  }}
                >
                  <div className="calendar__day-head">
                    <span className="calendar__number">{day.day}</span>
                    <button
                      type="button"
                      className="calendar__add"
                      aria-label={`Novo item em ${longDate(day.iso)}`}
                      onClick={() => onAdd(day.iso)}
                    >
                      +
                    </button>
                  </div>
                  <ul className="calendar__items">
                    {(byDate.get(day.iso) ?? []).map((row) => item(row, day.iso))}
                  </ul>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {undated.length > 0 && (
        <section className="calendar__undated" aria-label="Sem data">
          <h3>Sem data</h3>
          <ul className="calendar__items">{undated.map((row) => item(row, null))}</ul>
        </section>
      )}
    </div>
  );
}
