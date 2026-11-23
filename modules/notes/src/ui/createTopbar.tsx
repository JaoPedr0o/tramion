import { IconButton, Menu, MoreIcon, StarFilledIcon, StarIcon, TrashIcon } from "@tramion/ui";
import { Fragment, useState, type ComponentType } from "react";
import { ancestorsOf } from "../application/page-tree.ts";
import type { NoteSummary } from "../domain/note.ts";
import type { NotesUiDeps } from "./deps.ts";
import { editedAgo } from "./format.ts";
import { MoveDialog } from "./MoveDialog.tsx";
import { PageGlyph } from "./PageGlyph.tsx";
import { pageMenuItems } from "./pageMenu.tsx";
import { useNavigation } from "./useNavigation.ts";
import { usePages } from "./useNoteList.ts";

/**
 * Barra superior: o caminho até a página (cada ancestral é um botão), "Editado há…", a estrela de favoritos
 * e o menu "⋯" da página. Na lixeira, só o título da tela.
 */
export function createTopbar({ service, events, store, actions }: NotesUiDeps): ComponentType {
  return function NotesTopbar() {
    const nav = useNavigation(store);
    const pages = usePages(service, events);
    const list = pages.status === "ready" ? pages.items : [];
    const [moving, setMoving] = useState<NoteSummary | null>(null);

    if (nav.mode === "today") {
      return (
        <div className="notes-topbar">
          <span className="notes-breadcrumb__current">
            <span>Hoje</span>
          </span>
        </div>
      );
    }

    if (nav.mode === "trash") {
      return (
        <div className="notes-topbar">
          <span className="notes-breadcrumb__current">
            <TrashIcon />
            <span>Lixeira</span>
          </span>
        </div>
      );
    }

    const page = list.find((candidate) => candidate.id === nav.selectedId);
    if (!page) return null;

    const ancestors = ancestorsOf(list, page.id);
    const favoriteLabel = page.pinned ? "Remover dos favoritos" : "Adicionar aos favoritos";

    return (
      <div className="notes-topbar">
        <nav aria-label="Caminho" className="notes-breadcrumb">
          <ol>
            {ancestors.map((ancestor) => (
              <Fragment key={ancestor.id}>
                <li>
                  <button type="button" onClick={() => actions.openPage(ancestor.id, list)}>
                    {ancestor.title}
                  </button>
                </li>
                <li aria-hidden="true" className="notes-breadcrumb__separator">
                  /
                </li>
              </Fragment>
            ))}
            <li aria-current="page" className="notes-breadcrumb__current">
              <PageGlyph icon={page.icon} isDatabase={page.isDatabase} />
              <span>{page.title}</span>
            </li>
          </ol>
        </nav>

        <span className="notes-topbar__edited">{editedAgo(page.updatedAt, Date.now())}</span>
        <IconButton
          label={favoriteLabel}
          aria-pressed={page.pinned}
          onClick={() => void actions.toggleFavorite(page)}
        >
          {page.pinned ? <StarFilledIcon /> : <StarIcon />}
        </IconButton>
        <Menu
          label="Mais ações da página"
          icon={<MoreIcon />}
          items={pageMenuItems(page, {
            onNewSubpage: (target) => void actions.createPage(target.id, list),
            onDuplicate: (target) => void actions.duplicatePage(target.id, list),
            onExport: (target) => void actions.exportMarkdown(target, list),
            onMove: setMoving,
            onToggleFavorite: (target) => void actions.toggleFavorite(target),
            onDelete: (target) => void actions.deletePage(target.id),
          })}
        />

        {moving && (
          <MoveDialog
            pages={list}
            pageId={moving.id}
            onClose={() => setMoving(null)}
            onMove={(parent) => {
              setMoving(null);
              void actions.movePage(moving.id, parent, list);
            }}
          />
        )}
      </div>
    );
  };
}
