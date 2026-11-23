import { PlusIcon, StarFilledIcon, StarIcon, TrashIcon, type MenuItem } from "@tramion/ui";
import type { NoteSummary } from "../domain/note.ts";

export interface PageMenuHandlers {
  onNewSubpage(page: NoteSummary): void;
  onDuplicate(page: NoteSummary): void;
  onExport(page: NoteSummary): void;
  onHistory(page: NoteSummary): void;
  onMove(page: NoteSummary): void;
  onToggleFavorite(page: NoteSummary): void;
  onDelete(page: NoteSummary): void;
}

/** Itens do menu "⋯" de uma página: os mesmos na linha da árvore e na barra superior. */
export function pageMenuItems(page: NoteSummary, handlers: PageMenuHandlers): MenuItem[] {
  return [
    {
      id: "subpage",
      label: "Nova subpágina",
      icon: <PlusIcon />,
      onSelect: () => handlers.onNewSubpage(page),
    },
    { id: "duplicate", label: "Duplicar", onSelect: () => handlers.onDuplicate(page) },
    {
      id: "export",
      label: "Exportar como Markdown",
      onSelect: () => handlers.onExport(page),
    },
    { id: "history", label: "Histórico de versões", onSelect: () => handlers.onHistory(page) },
    { id: "move", label: "Mover para…", onSelect: () => handlers.onMove(page) },
    {
      id: "favorite",
      label: page.pinned ? "Remover dos favoritos" : "Adicionar aos favoritos",
      icon: page.pinned ? <StarFilledIcon /> : <StarIcon />,
      onSelect: () => handlers.onToggleFavorite(page),
    },
    {
      id: "trash",
      label: "Mover para a lixeira",
      icon: <TrashIcon />,
      danger: true,
      onSelect: () => handlers.onDelete(page),
    },
  ];
}
