import { displayValue } from "../application/database-query.ts";
import type { DatabaseRow, Property } from "../domain/database.ts";
import { PageGlyph } from "./PageGlyph.tsx";

interface Props {
  properties: readonly Property[];
  rows: readonly DatabaseRow[];
  onOpen(rowId: string): void;
}

/** Os valores preenchidos de uma linha, prontos para mostrar (nome da coluna e texto). */
export function filledValues(properties: readonly Property[], row: DatabaseRow) {
  return properties
    .map((property) => ({ property, text: displayValue(property, row.cells[property.id]) }))
    .filter(({ text }) => text !== "");
}

/** A lista: uma linha por página, com o título e os valores preenchidos ao lado. */
export function DatabaseList({ properties, rows, onOpen }: Props) {
  return (
    <ul className="db-list" aria-label="Lista">
      {rows.map((row) => (
        <li key={row.id} className="db-list__item">
          <button type="button" className="db-list__open" onClick={() => onOpen(row.id)}>
            <PageGlyph icon={row.icon} />
            <span className="db-list__title">{row.title}</span>
          </button>
          <span className="db-list__values">
            {filledValues(properties, row).map(({ property, text }) => (
              <span key={property.id} className="db-list__value" title={property.name}>
                {text}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
