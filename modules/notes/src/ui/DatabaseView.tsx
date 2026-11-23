import { TrashIcon } from "@tramion/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  filterRows,
  sortRows,
  type FilterRule,
  type SortRule,
} from "../application/database-query.ts";
import type {
  CellValue,
  DatabaseData,
  Property,
  PropertyType,
  SelectOption,
} from "../domain/database.ts";
import { Choice } from "./Choice.tsx";
import { DatabaseBoard } from "./DatabaseBoard.tsx";
import { DatabaseCalendar } from "./DatabaseCalendar.tsx";
import { DatabaseCell } from "./DatabaseCell.tsx";
import { DatabaseGallery } from "./DatabaseGallery.tsx";
import { DatabaseList } from "./DatabaseList.tsx";
import {
  AddPropertyButton,
  FilterButton,
  PropertyHeaderButton,
  SortButton,
} from "./DatabaseControls.tsx";
import type { NotesUiDeps } from "./deps.ts";
import { messageFor } from "./messages.ts";
import { PageGlyph } from "./PageGlyph.tsx";
import { usePages } from "./useNoteList.ts";
import { useSyncedDraft } from "./useSyncedDraft.ts";

interface Props {
  deps: NotesUiDeps;
  id: string;
}

type ViewMode = "table" | "board" | "list" | "gallery" | "calendar";

const VIEW_MODES: ReadonlyArray<readonly [ViewMode, string]> = [
  ["table", "Tabela"],
  ["board", "Quadro"],
  ["list", "Lista"],
  ["gallery", "Galeria"],
  ["calendar", "Calendário"],
];

/** A forma de exibição escolhida é lembrada por base (conveniência: se o armazenamento faltar, volta à tabela). */
const viewKey = (databaseId: string) => `tramion.databaseView.${databaseId}`;

function readView(databaseId: string): ViewMode {
  try {
    const stored = localStorage.getItem(viewKey(databaseId));
    return VIEW_MODES.some(([mode]) => mode === stored) ? (stored as ViewMode) : "table";
  } catch {
    return "table";
  }
}

function saveView(databaseId: string, mode: ViewMode) {
  try {
    localStorage.setItem(viewKey(databaseId), mode);
  } catch {
    /* sem armazenamento: não lembra */
  }
}

type State =
  | { status: "loading" }
  | { status: "ready"; data: DatabaseData }
  | { status: "error"; message: string };

/** Cores das opções, em rodízio (os nomes viram classes `db-chip--<cor>` no CSS). */
const OPTION_COLORS = [
  "blue",
  "green",
  "orange",
  "purple",
  "pink",
  "yellow",
  "red",
  "brown",
  "gray",
];

const newOptionId = () =>
  `o${(globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2)).replace(/-/g, "").slice(0, 10)}`;

/** A base de dados em tabela: colunas tipadas, linhas que são páginas, filtro e ordenação. */
export function DatabaseView({ deps, id }: Props) {
  const { service, events, actions } = deps;
  const pages = usePages(service, events);
  const allPages = pages.status === "ready" ? pages.items : [];
  const [state, setState] = useState<State>({ status: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<readonly FilterRule[]>([]);
  const [sort, setSort] = useState<SortRule | null>(null);
  const [view, setViewState] = useState<ViewMode>(() => readView(id));
  const [groupById, setGroupById] = useState<string | null>(null);
  const [dateById, setDateById] = useState<string | null>(null);
  const setView = (mode: ViewMode) => {
    setViewState(mode);
    saveView(id, mode);
  };

  const load = useCallback(() => {
    service.getDatabase(id).then(
      (data) => setState({ status: "ready", data }),
      (failure) => setState({ status: "error", message: messageFor(failure) }),
    );
  }, [service, id]);

  // Recarrega quando páginas mudam (criar, excluir, renomear linhas, inclusive por outra tela).
  useEffect(() => {
    load();
    const off = (
      [
        "note.created",
        "note.updated",
        "note.moved",
        "note.deleted",
        "note.restored",
        "note.purged",
      ] as const
    ).map((name) => events.on(name, load));
    return () => off.forEach((unsubscribe) => unsubscribe());
  }, [events, load]);

  const data = state.status === "ready" ? state.data : null;
  const rows = useMemo(
    () =>
      data ? sortRows(filterRows(data.rows, data.properties, rules), data.properties, sort) : [],
    [data, rules, sort],
  );

  const patch = (change: (data: DatabaseData) => DatabaseData) =>
    setState((current) =>
      current.status === "ready" ? { status: "ready", data: change(current.data) } : current,
    );

  /** Roda uma operação; a falha vira aviso na tela e devolve `false`. */
  const attempt = async (operation: () => Promise<void>): Promise<boolean> => {
    try {
      setError(null);
      await operation();
      return true;
    } catch (failure) {
      setError(messageFor(failure));
      return false;
    }
  };

  const replaceProperty = (property: Property) =>
    patch((d) => ({
      ...d,
      properties: d.properties.map((p) => (p.id === property.id ? property : p)),
    }));

  const addProperty = (name: string, type: PropertyType) =>
    attempt(async () => {
      const property = await service.addProperty({ databaseId: id, name, type });
      patch((d) => ({ ...d, properties: [...d.properties, property] }));
    });

  const setCell = (rowId: string, property: Property, value: CellValue | null) =>
    attempt(async () => {
      await service.setCell({ noteId: rowId, propertyId: property.id, value });
      patch((d) => ({
        ...d,
        rows: d.rows.map((row) => {
          if (row.id !== rowId) return row;
          const rest = Object.fromEntries(
            Object.entries(row.cells).filter(([key]) => key !== property.id),
          );
          return { ...row, cells: value === null ? rest : { ...rest, [property.id]: value } };
        }),
      }));
    });

  const createOption = async (property: Property, name: string): Promise<string | null> => {
    const option: SelectOption = {
      id: newOptionId(),
      name,
      color: OPTION_COLORS[property.options.length % OPTION_COLORS.length]!,
    };
    let created: string | null = null;
    await attempt(async () => {
      replaceProperty(
        await service.updateProperty({ id: property.id, options: [...property.options, option] }),
      );
      created = option.id;
    });
    return created;
  };

  const removeOption = (property: Property, optionId: string) =>
    attempt(async () => {
      replaceProperty(
        await service.updateProperty({
          id: property.id,
          options: property.options.filter((o) => o.id !== optionId),
        }),
      );
      load(); // as células que usavam a opção foram limpas pelo Rust
    }).then(() => undefined);

  /** Cria uma linha; com `initial`, já a cria com esse valor numa coluna (a coluna do quadro ou a data do calendário). */
  const addRow = (initial?: { property: Property; value: CellValue }) =>
    attempt(async () => {
      const note = await service.createRow({ databaseId: id, title: "Sem título" });
      const cells: Record<string, CellValue> = {};
      if (initial) {
        await service.setCell({
          noteId: note.id,
          propertyId: initial.property.id,
          value: initial.value,
        });
        cells[initial.property.id] = initial.value;
      }
      // O evento `note.created` também recarrega a base; quem chegar primeiro vale, sem duplicar a linha.
      patch((d) =>
        d.rows.some((row) => row.id === note.id)
          ? { ...d, rows: d.rows.map((row) => (row.id === note.id ? { ...row, cells } : row)) }
          : {
              ...d,
              rows: [
                ...d.rows,
                { id: note.id, title: note.title, icon: null, updatedAt: note.updatedAt, cells },
              ],
            },
      );
    });

  const renameRow = (rowId: string, title: string, updatedAt: number) =>
    attempt(async () => {
      const note = await service.renameNote({ id: rowId, title, expectedUpdatedAt: updatedAt });
      patch((d) => ({
        ...d,
        rows: d.rows.map((row) =>
          row.id === rowId ? { ...row, title: note.title, updatedAt: note.updatedAt } : row,
        ),
      }));
    });

  const ownSummary = allPages.find((page) => page.id === id);
  const renameDatabase = (title: string) =>
    ownSummary
      ? attempt(async () => {
          await service.renameNote({ id, title, expectedUpdatedAt: ownSummary.updatedAt });
        })
      : Promise.resolve(false);

  if (state.status === "loading")
    return (
      <p role="status" className="notes-main__placeholder">
        Carregando…
      </p>
    );
  if (state.status === "error")
    return (
      <p role="alert" className="notes-main__error">
        {state.message}
      </p>
    );

  const { properties } = state.data;
  // Tabela, lista e galeria mostram todas as linhas e têm o botão de nova linha; quadro e calendário criam por coluna e dia.
  const listLike = view === "table" || view === "list" || view === "gallery";
  const selectProperties = properties.filter((p) => p.type === "select");
  // A coluna do quadro: a escolhida, se ainda existir; senão a primeira de seleção.
  const groupProperty =
    selectProperties.find((p) => p.id === groupById) ?? selectProperties[0] ?? null;
  const dateProperties = properties.filter((p) => p.type === "date");
  // A coluna do calendário: a escolhida, se ainda existir; senão a primeira de data.
  const dateProperty = dateProperties.find((p) => p.id === dateById) ?? dateProperties[0] ?? null;
  return (
    <section className="database" aria-label="Base de dados">
      <TitleField key={state.data.title} title={state.data.title} onRename={renameDatabase} />

      <div className="db-toolbar">
        <div role="tablist" aria-label="Forma de exibição" className="db-views">
          {VIEW_MODES.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={view === mode}
              onClick={() => setView(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "board" && groupProperty && (
          <Choice
            label="Agrupar por"
            value={groupProperty.id}
            options={selectProperties.map((p) => ({ id: p.id, label: p.name }))}
            onChange={setGroupById}
          />
        )}
        {view === "calendar" && dateProperty && dateProperties.length > 1 && (
          <Choice
            label="Mostrar por"
            value={dateProperty.id}
            options={dateProperties.map((p) => ({ id: p.id, label: p.name }))}
            onChange={setDateById}
          />
        )}
        <FilterButton properties={properties} rules={rules} onChange={setRules} />
        <SortButton properties={properties} sort={sort} onChange={setSort} />
      </div>

      {error && (
        <p role="alert" className="notes-main__error">
          {error}
        </p>
      )}

      {view === "board" ? (
        groupProperty ? (
          <DatabaseBoard
            groupBy={groupProperty}
            properties={properties}
            rows={rows}
            onOpen={(rowId) => actions.openPage(rowId, allPages)}
            onMove={(rowId, optionId) => void setCell(rowId, groupProperty, optionId)}
            onAdd={(optionId) =>
              void addRow(optionId ? { property: groupProperty, value: optionId } : undefined)
            }
          />
        ) : (
          <p className="db-empty">
            Para ver o quadro, adicione uma coluna do tipo Seleção (como &quot;Status&quot;): cada
            opção vira uma coluna do quadro.
          </p>
        )
      ) : view === "list" ? (
        <DatabaseList
          properties={properties}
          rows={rows}
          onOpen={(rowId) => actions.openPage(rowId, allPages)}
        />
      ) : view === "gallery" ? (
        <DatabaseGallery
          properties={properties}
          rows={rows}
          onOpen={(rowId) => actions.openPage(rowId, allPages)}
        />
      ) : view === "calendar" ? (
        dateProperty ? (
          <DatabaseCalendar
            dateProperty={dateProperty}
            rows={rows}
            onOpen={(rowId) => actions.openPage(rowId, allPages)}
            onMoveDate={(rowId, iso) => void setCell(rowId, dateProperty, iso)}
            onAdd={(iso) => void addRow({ property: dateProperty, value: iso })}
          />
        ) : (
          <p className="db-empty">
            Para ver o calendário, adicione uma coluna do tipo Data: cada linha aparece no dia dela.
          </p>
        )
      ) : (
        <>
          <div className="db-scroll">
            <table className="db-table" aria-label="Linhas da base">
              <thead>
                <tr>
                  <th scope="col" className="db-table__title-col">
                    Título
                  </th>
                  {properties.map((property) => (
                    <th scope="col" key={property.id}>
                      <PropertyHeaderButton
                        property={property}
                        onRename={async (name) => {
                          await attempt(async () =>
                            replaceProperty(
                              await service.updateProperty({ id: property.id, name }),
                            ),
                          );
                        }}
                        onRemoveOption={(optionId) => removeOption(property, optionId)}
                        onDelete={async () => {
                          await attempt(async () => {
                            await service.deleteProperty(property.id);
                            patch((d) => ({
                              ...d,
                              properties: d.properties.filter((p) => p.id !== property.id),
                            }));
                          });
                        }}
                      />
                    </th>
                  ))}
                  <th scope="col" className="db-table__add">
                    <AddPropertyButton onAdd={addProperty} />
                  </th>
                  <th scope="col" className="db-table__actions" aria-label="Ações da linha" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="db-table__title-col">
                      <div className="db-title-cell">
                        <button
                          type="button"
                          className="db-title-cell__open"
                          aria-label={`Abrir ${row.title}`}
                          onClick={() => actions.openPage(row.id, allPages)}
                        >
                          <PageGlyph icon={row.icon} />
                        </button>
                        <TitleInput
                          title={row.title}
                          label={`Título de ${row.title}`}
                          onRename={(title) => renameRow(row.id, title, row.updatedAt)}
                        />
                      </div>
                    </td>
                    {properties.map((property) => (
                      <td key={property.id}>
                        <DatabaseCell
                          property={property}
                          rowTitle={row.title}
                          value={row.cells[property.id]}
                          onChange={(value) => void setCell(row.id, property, value)}
                          onCreateOption={(name) => createOption(property, name)}
                        />
                      </td>
                    ))}
                    <td />
                    <td className="db-table__actions">
                      <button
                        type="button"
                        className="db-row-delete"
                        aria-label={`Excluir ${row.title}`}
                        onClick={() => void actions.deletePage(row.id)}
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {listLike && rows.length === 0 && (
        <p className="db-empty">
          {state.data.rows.length === 0
            ? "Esta base ainda não tem linhas."
            : "Nenhuma linha passa nos filtros."}
        </p>
      )}
      {listLike && (
        <button type="button" className="db-new-row" onClick={() => void addRow()}>
          + Nova linha
        </button>
      )}
    </section>
  );
}

/** Campo de título que grava ao sair (vazio ou igual ao atual: volta ao que estava). */
function TitleInput({
  title,
  label,
  onRename,
}: {
  title: string;
  label: string;
  onRename(title: string): Promise<boolean>;
}) {
  const [draft, setDraft] = useSyncedDraft(title);
  const cancelled = useRef(false); // Esc cancela: o blur que vem depois não deve gravar
  return (
    <input
      className="db-title-cell__input"
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (cancelled.current) {
          cancelled.current = false;
          return;
        }
        const next = draft.trim();
        if (next === "" || next === title) return setDraft(title);
        void onRename(next).then((ok) => !ok && setDraft(title));
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelled.current = true;
          setDraft(title);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/** O título grande da base, no topo da página. */
function TitleField({
  title,
  onRename,
}: {
  title: string;
  onRename(title: string): Promise<boolean>;
}) {
  return (
    <h1 className="database__title">
      <TitleInput title={title} label="Título da base de dados" onRename={onRename} />
    </h1>
  );
}
