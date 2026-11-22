import type { NoteSummary } from "../domain/note.ts";

interface Props {
  notes: readonly NoteSummary[];
  selectedId: string | null;
  onSelect(id: string): void;
  label: string;
  emptyText: string;
}

export function NoteList({ notes, selectedId, onSelect, label, emptyText }: Props) {
  if (notes.length === 0) return <p className="notes-view__empty">{emptyText}</p>;

  return (
    <ul className="note-list" aria-label={label}>
      {notes.map((note) => (
        <li key={note.id}>
          <button
            type="button"
            className="note-list__item"
            aria-current={note.id === selectedId ? "true" : undefined}
            onClick={() => onSelect(note.id)}
          >
            {note.pinned && <span className="note-list__pin">Fixada</span>}
            <span className="note-list__title">{note.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
