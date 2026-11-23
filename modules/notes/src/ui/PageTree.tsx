import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { buildTree, visibleRows } from "../application/page-tree.ts";
import type { NoteSummary } from "../domain/note.ts";

interface Props {
  pages: readonly NoteSummary[];
  selectedId: string | null;
  expanded: ReadonlySet<string>;
  onToggle(id: string): void;
  onSelect(id: string): void;
  label: string;
}

/**
 * Árvore de páginas (padrão ARIA "tree"): um único item fica na ordem do Tab (foco "itinerante") e as
 * setas percorrem os demais. Setas: ↑ ↓ andam; → expande (ou entra na primeira filha); ← recolhe (ou
 * volta para a mãe); Home e End vão ao primeiro e ao último; Enter e Espaço abrem a página.
 */
export function PageTree({ pages, selectedId, expanded, onToggle, onSelect, label }: Props) {
  const rows = visibleRows(buildTree(pages), expanded);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const items = useRef(new Map<string, HTMLLIElement>());

  const present = (id: string | null) => id !== null && rows.some((row) => row.page.id === id);
  const tabbableId = present(focusedId)
    ? focusedId
    : present(selectedId)
      ? selectedId
      : rows[0]?.page.id;

  const focusRow = (index: number) => {
    const row = rows[index];
    if (row) items.current.get(row.page.id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return; // deixa os atalhos do app passarem
    const row = rows[index]!;
    let handled = true;

    switch (event.key) {
      case "ArrowDown":
        focusRow(Math.min(index + 1, rows.length - 1));
        break;
      case "ArrowUp":
        focusRow(Math.max(index - 1, 0));
        break;
      case "Home":
        focusRow(0);
        break;
      case "End":
        focusRow(rows.length - 1);
        break;
      case "ArrowRight":
        if (row.hasChildren && !row.expanded) onToggle(row.page.id);
        else if (row.hasChildren) focusRow(index + 1); // a primeira filha vem logo depois
        break;
      case "ArrowLeft":
        if (row.hasChildren && row.expanded) {
          onToggle(row.page.id);
        } else {
          const parentIndex = rows.findIndex((other) => other.page.id === row.page.parentId);
          if (parentIndex >= 0) focusRow(parentIndex);
        }
        break;
      case "Enter":
      case " ":
        onSelect(row.page.id);
        break;
      default:
        handled = false;
    }
    if (handled) event.preventDefault();
  };

  return (
    <ul role="tree" aria-label={label} className="page-tree">
      {rows.map((row, index) => {
        const id = row.page.id;
        return (
          <li
            key={id}
            role="treeitem"
            aria-level={row.depth + 1}
            aria-posinset={row.position}
            aria-setsize={row.siblings}
            aria-expanded={row.hasChildren ? row.expanded : undefined}
            aria-selected={id === selectedId}
            tabIndex={id === tabbableId ? 0 : -1}
            className="page-tree__item"
            style={{ "--depth": row.depth } as CSSProperties}
            ref={(element) => {
              if (element) items.current.set(id, element);
              else items.current.delete(id);
            }}
            onFocus={() => setFocusedId(id)}
            onClick={() => onSelect(id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span
              className="page-tree__chevron"
              aria-hidden="true"
              onClick={(event) => {
                event.stopPropagation();
                if (row.hasChildren) onToggle(id);
              }}
            >
              {row.hasChildren ? (row.expanded ? "▾" : "▸") : ""}
            </span>
            <span className="page-tree__title">{row.page.title}</span>
          </li>
        );
      })}
    </ul>
  );
}
