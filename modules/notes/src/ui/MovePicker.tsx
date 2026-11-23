import { useId, useState } from "react";
import { moveTargets } from "../application/page-tree.ts";
import type { NoteSummary } from "../domain/note.ts";

interface Props {
  pages: readonly NoteSummary[];
  pageId: string;
  /** `null` = a raiz. */
  onMove(newParentId: string | null): void;
  onCancel(): void;
}

/**
 * "Mover para…": um seletor com os destinos VÁLIDOS (sem a própria página nem suas descendentes, o que
 * evitaria ciclos já na tela; o Rust confere de novo). É a alternativa acessível a arrastar.
 */
export function MovePicker({ pages, pageId, onMove, onCancel }: Props) {
  const targets = moveTargets(pages, pageId);
  const current = pages.find((page) => page.id === pageId)?.parentId ?? null;
  const [choice, setChoice] = useState<string>(current ?? "");
  const selectId = useId();

  return (
    <div className="move-picker" role="group" aria-label="Mover página">
      <label htmlFor={selectId}>Mover para</label>
      <select id={selectId} value={choice} onChange={(event) => setChoice(event.target.value)}>
        {targets.map((target) => (
          <option key={target.id ?? "raiz"} value={target.id ?? ""}>
            {`${"— ".repeat(target.depth)}${target.title}`}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => onMove(choice === "" ? null : choice)}>
        Mover
      </button>
      <button type="button" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  );
}
