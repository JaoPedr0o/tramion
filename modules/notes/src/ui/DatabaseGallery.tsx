import type { DatabaseRow, Property } from "../domain/database.ts";
import { filledValues } from "./DatabaseList.tsx";
import { PageGlyph } from "./PageGlyph.tsx";

interface Props {
  properties: readonly Property[];
  rows: readonly DatabaseRow[];
  onOpen(rowId: string): void;
}

/** A galeria: cartões grandes numa grade, com o símbolo da página, o título e os valores preenchidos. */
export function DatabaseGallery({ properties, rows, onOpen }: Props) {
  return (
    <ul className="db-gallery" aria-label="Galeria">
      {rows.map((row) => (
        <li key={row.id} className="db-gallery__card">
          <button type="button" className="db-gallery__open" onClick={() => onOpen(row.id)}>
            <span className="db-gallery__glyph" aria-hidden="true">
              <PageGlyph icon={row.icon} size={32} />
            </span>
            <span className="db-gallery__title">{row.title}</span>
          </button>
          <ul className="db-gallery__details">
            {filledValues(properties, row).map(({ property, text }) => (
              <li key={property.id}>
                <span className="board__detail-name">{property.name}:</span> {text}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
