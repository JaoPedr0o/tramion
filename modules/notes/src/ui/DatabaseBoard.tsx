import { useState } from "react";
import { displayValue, groupRows } from "../application/database-query.ts";
import type { DatabaseRow, Property } from "../domain/database.ts";
import { Choice } from "./Choice.tsx";
import { PageGlyph } from "./PageGlyph.tsx";

interface Props {
  /** A coluna de seleção que define as colunas do quadro. */
  groupBy: Property;
  /** Demais colunas, mostradas dentro de cada cartão quando preenchidas. */
  properties: readonly Property[];
  rows: readonly DatabaseRow[];
  onOpen(rowId: string): void;
  /** Move o cartão para uma opção (`null` = "sem valor"). */
  onMove(rowId: string, optionId: string | null): void;
  /** Cria um cartão novo já na coluna indicada. */
  onAdd(optionId: string | null): void;
}

const NO_VALUE = "__none__";

/** O quadro (Kanban): uma coluna por opção da coluna de seleção; arrastar um cartão troca o valor dele. */
export function DatabaseBoard({ groupBy, properties, rows, onOpen, onMove, onAdd }: Props) {
  const columns = groupRows(rows, groupBy);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const keyOf = (optionId: string | null) => optionId ?? NO_VALUE;
  const targets = [
    ...groupBy.options.map((option) => ({ id: option.id, label: option.name })),
    { id: NO_VALUE, label: "Sem valor" },
  ];

  return (
    <div className="board" role="group" aria-label={`Quadro por ${groupBy.name}`}>
      {columns.map((column) => {
        const key = keyOf(column.option?.id ?? null);
        const name = column.option?.name ?? "Sem valor";
        return (
          <section
            key={key}
            className={over === key ? "board__column board__column--over" : "board__column"}
            aria-label={name}
            onDragOver={(event) => {
              if (dragging === null) return;
              event.preventDefault();
              setOver(key);
            }}
            onDragLeave={() => setOver((current) => (current === key ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging !== null) onMove(dragging, column.option?.id ?? null);
              setDragging(null);
              setOver(null);
            }}
          >
            <header className="board__header">
              <span className={`db-chip db-chip--${column.option?.color ?? "default"}`}>
                {name}
              </span>
              <span className="board__count" aria-label={`${column.rows.length} cartões`}>
                {column.rows.length}
              </span>
            </header>

            <ul className="board__cards">
              {column.rows.map((row) => (
                <li
                  key={row.id}
                  className="board__card"
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
                  <button type="button" className="board__open" onClick={() => onOpen(row.id)}>
                    <PageGlyph icon={row.icon} />
                    <span>{row.title}</span>
                  </button>
                  <ul className="board__details">
                    {properties
                      .filter((property) => property.id !== groupBy.id)
                      .map(
                        (property) =>
                          [property, displayValue(property, row.cells[property.id])] as const,
                      )
                      .filter(([, text]) => text !== "")
                      .map(([property, text]) => (
                        <li key={property.id}>
                          <span className="board__detail-name">{property.name}:</span> {text}
                        </li>
                      ))}
                  </ul>
                  {/* Alternativa ao arrastar (teclado e leitores de tela): escolher a coluna de destino. */}
                  <span className="board__move">
                    <Choice
                      label={`Mover ${row.title} para`}
                      value={key}
                      options={targets}
                      placeholder="Mover…"
                      onChange={(id) => id !== key && onMove(row.id, id === NO_VALUE ? null : id)}
                    />
                  </span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="board__add"
              aria-label={`Novo cartão em ${name}`}
              onClick={() => onAdd(column.option?.id ?? null)}
            >
              + Novo
            </button>
          </section>
        );
      })}
    </div>
  );
}
