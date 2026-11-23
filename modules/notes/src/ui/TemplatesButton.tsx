import { PlusIcon } from "@tramion/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NoteSummary, TemplateInfo } from "../domain/note.ts";
import type { NotesUiDeps } from "./deps.ts";
import { Popover } from "./Popover.tsx";

/** "Modelos": lista os modelos de página; escolher um cria a página na raiz e a abre. */
export function TemplatesButton({
  deps,
  pages,
}: {
  deps: NotesUiDeps;
  pages: readonly NoteSummary[];
}) {
  const { service, actions } = deps;
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<readonly TemplateInfo[] | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const ignore = useMemo(() => [anchor], []);

  // Os modelos vêm do Rust uma vez, quando a lista é aberta pela primeira vez.
  useEffect(() => {
    if (!open || templates !== null) return;
    let current = true;
    service.listTemplates().then(
      (list) => current && setTemplates(list),
      () => current && setTemplates([]),
    );
    return () => {
      current = false;
    };
  }, [open, templates, service]);

  return (
    <div ref={anchor} className="templates">
      <button
        type="button"
        className="sidebar-row"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <span className="sidebar-row__icon" aria-hidden="true">
          <PlusIcon />
        </span>
        <span className="sidebar-row__title">Modelos</span>
      </button>
      {open && (
        <Popover
          label="Modelos de página"
          anchor={anchor}
          ignore={ignore}
          onClose={() => setOpen(false)}
        >
          {templates === null && <p role="status">Carregando…</p>}
          {templates?.length === 0 && <p className="popover__note">Nenhum modelo disponível.</p>}
          <ul className="templates__list">
            {templates?.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  className="templates__item"
                  onClick={() => {
                    setOpen(false);
                    void actions.createFromTemplate(template.id, null, pages);
                  }}
                >
                  <span aria-hidden="true">{template.icon}</span>
                  <span className="templates__text">
                    <span className="templates__name">{template.name}</span>
                    <span className="templates__description">{template.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Popover>
      )}
    </div>
  );
}
