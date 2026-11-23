import type { NoteSummary } from "../domain/note.ts";

interface Props {
  notes: readonly NoteSummary[];
  selectedId: string | null;
  onSelect(id: string): void;
  label: string;
}

/** Lista simples de páginas (usada na seção "Fixadas"). */
export function NoteList({ notes, selectedId, onSelect, label }: Props) {
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
            <span className="note-list__title">{note.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
