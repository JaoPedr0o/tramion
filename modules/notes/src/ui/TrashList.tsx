import type { TrashSummary } from "../domain/note.ts";

interface Props {
  items: readonly TrashSummary[];
  selectedId: string | null;
  onSelect(id: string): void;
}

/** Quantas subpáginas, no singular ou no plural. */
export function subpagesText(count: number): string {
  return count === 1 ? "1 subpágina" : `${count} subpáginas`;
}

/** Lixeira: só as raízes de cada exclusão; as subpáginas excluídas junto entram na contagem. */
export function TrashList({ items, selectedId, onSelect }: Props) {
  if (items.length === 0) return <p className="notes-view__empty">A lixeira está vazia.</p>;

  return (
    <ul className="note-list" aria-label="Notas na lixeira">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="note-list__item"
            aria-current={item.id === selectedId ? "true" : undefined}
            onClick={() => onSelect(item.id)}
          >
            <span className="note-list__title">{item.title}</span>
            {item.descendantCount > 0 && (
              <span className="note-list__meta">{subpagesText(item.descendantCount)}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
