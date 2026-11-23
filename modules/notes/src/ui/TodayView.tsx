import { useCallback, useEffect, useState } from "react";
import { longDate, todayIso } from "../application/calendar.ts";
import { splitDue } from "../application/reminders.ts";
import type { DueTask } from "../domain/database.ts";
import type { NoteSummary } from "../domain/note.ts";
import type { NotesUiDeps } from "./deps.ts";
import { PageGlyph } from "./PageGlyph.tsx";
import { usePages } from "./useNoteList.ts";

/** Quantos dias à frente a agenda mostra. */
const AGENDA_DAYS = 7;
/** Quantas páginas recentes aparecem. */
const RECENT_COUNT = 8;

const CHANGE_EVENTS = [
  "note.created",
  "note.updated",
  "note.moved",
  "note.deleted",
  "note.restored",
  "note.purged",
] as const;

/**
 * A página "Hoje": o que pede atenção agora (atrasadas e de hoje), a agenda dos próximos dias, as páginas editadas
 * por último e os favoritos. As tarefas vêm das bases com lembretes ligados.
 */
export function TodayView({ deps }: { deps: NotesUiDeps }) {
  const { service, events, actions } = deps;
  const pages = usePages(service, events);
  const list = pages.status === "ready" ? pages.items : [];
  const [due, setDue] = useState<readonly DueTask[]>([]);
  const [upcoming, setUpcoming] = useState<readonly DueTask[]>([]);
  const [failed, setFailed] = useState(false);
  const today = todayIso();

  const load = useCallback(() => {
    Promise.all([
      service.dueTasks(todayIso()),
      service.upcomingTasks(todayIso(), AGENDA_DAYS),
    ]).then(
      ([now, next]) => {
        setDue(now);
        setUpcoming(next);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [service]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const off = CHANGE_EVENTS.map((name) => events.on(name, load));
    return () => {
      clearTimeout(first);
      off.forEach((unsubscribe) => unsubscribe());
    };
  }, [events, load]);

  const databaseIds = new Set(list.filter((p) => p.isDatabase).map((p) => p.id));
  // Linhas de bases não entram nas recentes (são parte da base).
  const recent = list
    .filter((p) => !(p.parentId && databaseIds.has(p.parentId)))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, RECENT_COUNT);
  const favorites = list.filter((p) => p.pinned).sort((a, b) => a.title.localeCompare(b.title));
  const { overdue, today: dueToday } = splitDue(due);

  const taskList = (tasks: readonly DueTask[], label: string) =>
    tasks.length === 0 ? null : (
      <ul className="today__list" aria-label={label}>
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              className="today__item"
              onClick={() => actions.openPage(task.id, list)}
            >
              <PageGlyph icon={task.icon} />
              <span className="today__title">{task.title}</span>
              <span className="today__meta">
                {task.databaseTitle} · {longDate(task.date)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  const pageList = (items: readonly NoteSummary[], label: string) => (
    <ul className="today__list" aria-label={label}>
      {items.map((page) => (
        <li key={page.id}>
          <button
            type="button"
            className="today__item"
            onClick={() => actions.openPage(page.id, list)}
          >
            <PageGlyph icon={page.icon} isDatabase={page.isDatabase} />
            <span className="today__title">{page.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  const nothingDue = due.length === 0 && upcoming.length === 0;
  return (
    <section className="today" aria-labelledby="today-title">
      <h1 id="today-title" className="today__heading">
        Hoje
      </h1>
      <p className="today__date">{longDate(today)}</p>

      {failed && (
        <p role="alert" className="notes-main__error">
          Não foi possível carregar as tarefas agora.
        </p>
      )}
      {nothingDue && !failed && (
        <p className="today__empty">
          Nenhuma tarefa pede atenção. Ligue os lembretes numa base de dados com uma coluna de data
          para vê-la aqui.
        </p>
      )}

      {overdue.length > 0 && (
        <section aria-label="Atrasadas">
          <h2 className="today__section">Atrasadas</h2>
          {taskList(overdue, "Tarefas atrasadas")}
        </section>
      )}
      {dueToday.length > 0 && (
        <section aria-label="Para hoje">
          <h2 className="today__section">Para hoje</h2>
          {taskList(dueToday, "Tarefas de hoje")}
        </section>
      )}
      {upcoming.length > 0 && (
        <section aria-label="Próximos dias">
          <h2 className="today__section">Próximos {AGENDA_DAYS} dias</h2>
          {taskList(upcoming, "Tarefas dos próximos dias")}
        </section>
      )}

      {recent.length > 0 && (
        <section aria-label="Editadas recentemente">
          <h2 className="today__section">Editadas recentemente</h2>
          {pageList(recent, "Páginas recentes")}
        </section>
      )}
      {favorites.length > 0 && (
        <section aria-label="Favoritos">
          <h2 className="today__section">Favoritos</h2>
          {pageList(favorites, "Páginas favoritas")}
        </section>
      )}
    </section>
  );
}
