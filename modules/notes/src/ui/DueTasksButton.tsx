import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { longDate, todayIso } from "../application/calendar.ts";
import {
  readReminderSettings,
  saveReminderSettings,
  type ReminderSettings,
} from "../application/reminder-settings.ts";
import { digestMessage, isDigestDue, isValidTime, splitDue } from "../application/reminders.ts";
import type { DueTask } from "../domain/database.ts";
import type { NoteSummary } from "../domain/note.ts";
import type { NotesUiDeps } from "./deps.ts";
import { PageGlyph } from "./PageGlyph.tsx";
import { Popover } from "./Popover.tsx";

/** De quanto em quanto tempo se confere as tarefas (o dia pode virar com o app aberto). */
const CHECK_EVERY_MS = 60_000;

const CHANGE_EVENTS = [
  "note.created",
  "note.updated",
  "note.moved",
  "note.deleted",
  "note.restored",
  "note.purged",
] as const;

/**
 * "Lembretes" na barra lateral: mostra quantas tarefas pedem atenção (atrasadas ou com prazo hoje, de bases com lembretes
 * ligados) e, ao abrir, a lista e as preferências. Também é quem dispara o aviso diário do sistema, uma vez por dia, a
 * partir do horário combinado, enquanto o aplicativo está aberto.
 */
export function DueTasksButton({
  deps,
  pages,
}: {
  deps: NotesUiDeps;
  pages: readonly NoteSummary[];
}) {
  const { service, events, actions, platform } = deps;
  const [tasks, setTasks] = useState<readonly DueTask[]>([]);
  const [settings, setSettings] = useState<ReminderSettings>(readReminderSettings);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const ignore = useMemo(() => [anchor], []);
  const current = useRef(settings);

  const update = (next: ReminderSettings) => {
    current.current = next;
    setSettings(next);
    saveReminderSettings(next);
  };

  const refresh = useCallback(async () => {
    try {
      const due = await service.dueTasks(todayIso());
      setTasks(due);
      const now = new Date();
      const s = current.current;
      if (
        s.systemNotifications &&
        isDigestDue({ now, time: s.time, lastDigest: s.lastDigest, count: due.length })
      ) {
        const message = digestMessage(due);
        await platform.notify(message.title, message.body);
        const next = { ...current.current, lastDigest: todayIso(now) };
        current.current = next;
        setSettings(next);
        saveReminderSettings(next);
      }
    } catch {
      // Sem resposta agora: tenta de novo no próximo ciclo.
    }
  }, [service, platform]);

  useEffect(() => {
    // A primeira conferência é agendada (não roda direto no efeito), e as seguintes seguem o ritmo normal.
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), CHECK_EVERY_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const off = CHANGE_EVENTS.map((name) => events.on(name, () => void refresh()));
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      off.forEach((unsubscribe) => unsubscribe());
    };
  }, [refresh, events]);

  const { overdue, today } = splitDue(tasks);
  const group = (title: string, list: readonly DueTask[]) =>
    list.length === 0 ? null : (
      <section aria-label={title}>
        <h3 className="popover__heading">{title}</h3>
        <ul className="due__list">
          {list.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                className="due__item"
                onClick={() => {
                  setOpen(false);
                  actions.openPage(task.id, pages);
                }}
              >
                <PageGlyph icon={task.icon} />
                <span className="due__text">
                  <span className="due__title">{task.title}</span>
                  <span className="due__meta">
                    {task.databaseTitle} · {longDate(task.date)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div ref={anchor} className="due">
      <button
        type="button"
        className="sidebar-row"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={tasks.length > 0 ? `Lembretes (${tasks.length})` : "Lembretes"}
        onClick={() => setOpen((was) => !was)}
      >
        <span className="sidebar-row__icon" aria-hidden="true">
          ◔
        </span>
        <span className="sidebar-row__title">Lembretes</span>
        {tasks.length > 0 && (
          <span className="due__badge" aria-hidden="true">
            {tasks.length}
          </span>
        )}
      </button>

      {open && (
        <Popover
          label="Lembretes de tarefas"
          anchor={anchor}
          ignore={ignore}
          onClose={() => setOpen(false)}
          className="due__popover"
        >
          <h2 className="due__heading">Lembretes de tarefas</h2>
          <div className="due__body">
            {tasks.length === 0 && (
              <p className="popover__note">Nenhuma tarefa pede atenção hoje.</p>
            )}
            {group("Atrasadas", overdue)}
            {group("Hoje", today)}

            <div className="due__settings">
              <label className="due__option">
                <input
                  type="checkbox"
                  checked={settings.systemNotifications}
                  onChange={(event) =>
                    update({ ...settings, systemNotifications: event.target.checked })
                  }
                />
                Avisar pelo sistema uma vez por dia
              </label>
              <label className="due__option">
                Horário do aviso
                <input
                  type="time"
                  value={settings.time}
                  disabled={!settings.systemNotifications}
                  onChange={(event) => {
                    if (isValidTime(event.target.value))
                      update({ ...settings, time: event.target.value });
                  }}
                />
              </label>
              <p className="popover__note">O aviso aparece enquanto o Tramion está aberto.</p>
            </div>
          </div>
          <button type="button" className="dlg-btn due__close" onClick={() => setOpen(false)}>
            Fechar
          </button>
        </Popover>
      )}
    </div>
  );
}
