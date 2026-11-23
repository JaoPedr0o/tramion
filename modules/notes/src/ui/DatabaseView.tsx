import { CHANGE_EVENTS } from "../application/change-events.ts";
import { TrashIcon } from "@tramion/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHART_CATEGORY_TYPES,
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
  ReminderConfig,
  SelectOption,
  ViewConfig,
  ViewMode,
} from "../domain/database.ts";
import { VIEW_MODES } from "../domain/database.ts";
import { Choice } from "./Choice.tsx";
import { DatabaseBoard } from "./DatabaseBoard.tsx";
import { DatabaseCalendar } from "./DatabaseCalendar.tsx";
import { DatabaseChart } from "./DatabaseChart.tsx";
import { DatabaseCell } from "./DatabaseCell.tsx";
import { DatabaseGallery } from "./DatabaseGallery.tsx";
import { DatabaseList } from "./DatabaseList.tsx";
import {
  AddPropertyButton,
  defaultReminderConfig,
  FilterButton,
  NewViewButton,
  PropertyHeaderButton,
  RemindersButton,
  SortButton,
  ViewOptionsButton,
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
  const [activeId, setActiveId] = useState<string | null>(null);
  // Alterações de visão ainda não gravadas (a gravação espera uma pausa): valem sobre o que vier do banco.
  const pending = useRef(new Map<string, ViewConfig>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const load = useCallback(() => {
    service.getDatabase(id).then(
      (data) =>
        setState({
          status: "ready",
          data: {
            ...data,
            views: data.views.map((v) =>
              pending.current.has(v.id) ? { ...v, config: pending.current.get(v.id)! } : v,
            ),
          },
        }),
      (failure) => setState({ status: "error", message: messageFor(failure) }),
    );
  }, [service, id]);

  // Recarrega quando páginas mudam (criar, excluir, renomear linhas, inclusive por outra tela).
  useEffect(() => {
    load();
    const off = CHANGE_EVENTS.map((name) => events.on(name, load));
    return () => off.forEach((unsubscribe) => unsubscribe());
  }, [events, load]);

  const data = state.status === "ready" ? state.data : null;
  const activeView = data
    ? (data.views.find((v) => v.id === activeId) ?? data.views[0])
    : undefined;
  const config = activeView?.config;
  const view: ViewMode = config?.mode ?? "table";
  const rules = useMemo(() => (config?.filters ?? []) as readonly FilterRule[], [config]);
  const sort = (config?.sort ?? null) as SortRule | null;
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

  // Ao sair da tela, grava o que ainda estiver esperando a pausa.
  useEffect(() => {
    const waiting = timers.current;
    const configs = pending.current;
    return () => {
      for (const [viewId, timer] of waiting) {
        clearTimeout(timer);
        const config = configs.get(viewId);
        if (config) void service.updateView({ id: viewId, config }).catch(() => {});
      }
    };
  }, [service]);

  /** Muda a configuração da visão ativa na tela na hora e grava depois de uma pausa (evita uma gravação por tecla). */
  const updateConfig = (change: Partial<ViewConfig>) => {
    if (!activeView) return;
    const viewId = activeView.id;
    const next: ViewConfig = { ...activeView.config, ...change };
    patch((d) => ({
      ...d,
      views: d.views.map((v) => (v.id === viewId ? { ...v, config: next } : v)),
    }));
    pending.current.set(viewId, next);
    clearTimeout(timers.current.get(viewId));
    timers.current.set(
      viewId,
      setTimeout(() => {
        const config = pending.current.get(viewId);
        pending.current.delete(viewId);
        timers.current.delete(viewId);
        if (config)
          void attempt(async () => void (await service.updateView({ id: viewId, config })));
      }, 500),
    );
  };

  /** Nome livre para uma visão nova: "Quadro", "Quadro 2", "Quadro 3"... */
  const freeName = (base: string) => {
    const used = new Set((data?.views ?? []).map((v) => v.name));
    if (!used.has(base)) return base;
    let n = 2;
    while (used.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  };

  const createView = (name: string, config: ViewConfig) =>
    attempt(async () => {
      const created = await service.addView({ databaseId: id, name: freeName(name), config });
      patch((d) => ({ ...d, views: [...d.views, created] }));
      setActiveId(created.id);
    });

  const renameView = (viewId: string, name: string) =>
    attempt(async () => {
      const updated = await service.updateView({ id: viewId, name });
      patch((d) => ({ ...d, views: d.views.map((v) => (v.id === viewId ? updated : v)) }));
    });

  const deleteView = (viewId: string) =>
    attempt(async () => {
      await service.deleteView(viewId);
      pending.current.delete(viewId);
      clearTimeout(timers.current.get(viewId));
      timers.current.delete(viewId);
      patch((d) => ({ ...d, views: d.views.filter((v) => v.id !== viewId) }));
      setActiveId(null);
    });

  const saveReminders = (config: ReminderConfig | null) =>
    attempt(async () => {
      const saved = await service.setReminders({ databaseId: id, config });
      patch((d) => ({ ...d, reminders: saved }));
    });

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
      // Escolher uma hora é pedir um aviso: se a base ainda não tem lembretes configurados, liga com esta coluna de data
      // como prazo. (Quem desligou os lembretes de propósito tem a configuração guardada como desligada e não é afetado.)
      if (
        property.type === "date" &&
        typeof value === "string" &&
        value.includes("T") &&
        data &&
        data.reminders === null
      ) {
        const base = defaultReminderConfig(data.properties);
        if (base) await saveReminders({ ...base, dateProperty: property.id });
      }
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
    selectProperties.find((p) => p.id === config?.groupBy) ?? selectProperties[0] ?? null;
  const dateProperties = properties.filter((p) => p.type === "date");
  // Gráfico: a coluna das barras (seleção, caixa ou data) e, se houver, a coluna de número que elas somam.
  const chartCategories = properties.filter((p) => CHART_CATEGORY_TYPES.includes(p.type));
  const chartCategory =
    chartCategories.find((p) => p.id === config?.groupBy) ?? chartCategories[0] ?? null;
  const numberProperties = properties.filter((p) => p.type === "number");
  const chartMeasure = numberProperties.find((p) => p.id === config?.valueProperty) ?? null;
  // A coluna do calendário: a escolhida, se ainda existir; senão a primeira de data.
  const dateProperty =
    dateProperties.find((p) => p.id === config?.dateProperty) ?? dateProperties[0] ?? null;
  return (
    <section className="database" aria-label="Base de dados">
      <TitleField key={state.data.title} title={state.data.title} onRename={renameDatabase} />

      <div className="db-toolbar">
        <div role="tablist" aria-label="Visões" className="db-views">
          {state.data.views.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={v.id === activeView?.id}
              onClick={() => setActiveId(v.id)}
            >
              {v.name}
            </button>
          ))}
          <NewViewButton
            onCreate={(mode) =>
              void createView(VIEW_MODES.find(([m]) => m === mode)![1], {
                mode,
                filters: [],
                sort: null,
              })
            }
          />
          {activeView && (
            <ViewOptionsButton
              view={activeView}
              canDelete={state.data.views.length > 1}
              onRename={(name) => renameView(activeView.id, name)}
              onMode={(mode) => updateConfig({ mode })}
              onDuplicate={() =>
                void createView(`${activeView.name} (cópia)`, { ...activeView.config })
              }
              onDelete={() => deleteView(activeView.id)}
            />
          )}
        </div>
        {view === "board" && groupProperty && (
          <Choice
            label="Agrupar por"
            value={groupProperty.id}
            options={selectProperties.map((p) => ({ id: p.id, label: p.name }))}
            onChange={(groupBy) => updateConfig({ groupBy })}
          />
        )}
        {view === "chart" && chartCategory && (
          <>
            <Choice
              label="Barras por"
              value={chartCategory.id}
              options={chartCategories.map((p) => ({ id: p.id, label: p.name }))}
              onChange={(groupBy) => updateConfig({ groupBy })}
            />
            <Choice
              label="Medir"
              value={chartMeasure?.id ?? "count"}
              options={[
                { id: "count", label: "Contar linhas" },
                ...numberProperties.map((p) => ({ id: p.id, label: `Somar ${p.name}` })),
              ]}
              onChange={(id) => updateConfig({ valueProperty: id === "count" ? null : id })}
            />
          </>
        )}
        {view === "calendar" && dateProperty && dateProperties.length > 1 && (
          <Choice
            label="Mostrar por"
            value={dateProperty.id}
            options={dateProperties.map((p) => ({ id: p.id, label: p.name }))}
            onChange={(dateProperty) => updateConfig({ dateProperty })}
          />
        )}
        <FilterButton
          properties={properties}
          rules={rules}
          onChange={(filters) => updateConfig({ filters: filters as ViewConfig["filters"] })}
        />
        <RemindersButton
          properties={properties}
          config={state.data.reminders}
          onChange={(config) => void saveReminders(config)}
        />
        <SortButton
          properties={properties}
          sort={sort}
          onChange={(sort) => updateConfig({ sort })}
        />
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
      ) : view === "chart" ? (
        chartCategory ? (
          <DatabaseChart rows={rows} category={chartCategory} measure={chartMeasure} />
        ) : (
          <p className="db-empty">
            Para ver o gráfico, adicione uma coluna do tipo Seleção, Caixa de seleção ou Data: cada
            categoria vira uma barra.
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
            scale={config?.scale ?? "month"}
            onScaleChange={(scale) => updateConfig({ scale })}
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
