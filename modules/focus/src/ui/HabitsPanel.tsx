import { useEffect, useState } from "react";
import { dailyCounts, lastDays, streakOf, type HabitsStore } from "../application/habits-store.ts";
import type { Day } from "../domain/day.ts";
import type { Habit } from "../domain/habit.ts";
import { checksInWeek } from "../domain/streak.ts";
import { HabitDialog } from "./HabitDialog.tsx";
import { Heatmap, longDate } from "./Heatmap.tsx";
import { useStore, useTicker } from "./hooks.ts";
import { messageFor } from "./messages.ts";

const WEEKDAY_LETTER = ["D", "S", "T", "Q", "Q", "S", "S"];

function letterOf(day: Day): string {
  return WEEKDAY_LETTER[new Date(`${day}T00:00:00Z`).getUTCDay()] ?? "";
}

function frequencyText(habit: Habit): string {
  if (habit.frequency === "daily") return "Todo dia";
  if (habit.frequency === "weekdays") return "Dias úteis";
  const n = habit.timesPerWeek ?? 1;
  return n === 1 ? "1 vez por semana" : `${n} vezes por semana`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Hábitos: marcar o dia com um toque, ver a sequência e o mapa de calor. Só aparece quando a pessoa abre. */
export function HabitsPanel({ store }: { store: HabitsStore }) {
  const snap = useStore(store);
  const [editing, setEditing] = useState<Habit | "new" | null>(null);

  useEffect(() => {
    void store.reload();
  }, [store]);

  // Confere a virada do dia de vez em quando (a tela pode ficar aberta de um dia para o outro).
  useTicker(true, 30_000);
  const today = store.today();

  const active = snap.habits.filter((habit) => habit.archivedAt === null);
  const counts = dailyCounts(snap.habits, snap.checks);

  return (
    <section className="focus-card focus-habits" aria-labelledby="focus-habits-title">
      <div className="focus-habits__head">
        <h2 id="focus-habits-title">Hábitos</h2>
        <button type="button" className="focus-btn" onClick={() => setEditing("new")}>
          Novo hábito
        </button>
      </div>

      {snap.error && editing === null ? (
        <p role="alert" className="focus-error">
          {messageFor(snap.error)}{" "}
          <button type="button" className="focus-link" onClick={() => store.clearError()}>
            Fechar
          </button>
        </p>
      ) : null}

      {snap.loaded && snap.habits.length === 0 ? (
        <p className="focus-empty">
          {snap.showArchived
            ? "Nenhum hábito por aqui."
            : "Nenhum hábito ainda. Crie um quando quiser."}
        </p>
      ) : null}

      {active.length > 0 ? <Heatmap counts={counts} total={active.length} today={today} /> : null}

      <ul className="focus-habit-list" aria-label="Seus hábitos">
        {snap.habits.map((habit) => (
          <HabitRow
            key={habit.id}
            habit={habit}
            days={snap.checks.get(habit.id)}
            today={today}
            onToggle={(day) => void store.toggle(habit.id, day)}
            onEdit={() => setEditing(habit)}
            onArchive={() => void store.archive(habit.id, habit.archivedAt === null)}
          />
        ))}
      </ul>

      <label className="focus-check focus-habits__archived">
        <input
          type="checkbox"
          checked={snap.showArchived}
          onChange={(event) => void store.setShowArchived(event.target.checked)}
        />
        <span>Mostrar arquivados</span>
      </label>

      {editing !== null ? (
        <HabitDialog
          habit={editing === "new" ? null : editing}
          error={snap.error}
          onSubmit={(input) =>
            editing === "new" ? store.create(input) : store.update(editing.id, input)
          }
          onClose={() => {
            store.clearError();
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

interface RowProps {
  habit: Habit;
  days: ReadonlySet<Day> | undefined;
  today: Day;
  onToggle: (day: Day) => void;
  onEdit: () => void;
  onArchive: () => void;
}

function HabitRow({ habit, days, today, onToggle, onEdit, onArchive }: RowProps) {
  const archived = habit.archivedAt !== null;
  const done = days?.has(today) ?? false;
  const streak = streakOf(habit, days, today);
  const unit = streak.unit === "weeks" ? ["semana", "semanas"] : ["dia", "dias"];
  const week = habit.frequency === "weekly" ? checksInWeek(days ?? [], today) : null;

  return (
    <li className="focus-habit" data-archived={archived ? "true" : undefined}>
      <button
        type="button"
        className="focus-habit__check"
        aria-pressed={done}
        aria-label={`${habit.name}: ${done ? "feito hoje (desmarcar)" : "marcar hoje"}`}
        disabled={archived}
        onClick={() => onToggle(today)}
      >
        <span aria-hidden="true">{done ? "✓" : ""}</span>
      </button>

      <div className="focus-habit__body">
        <p className="focus-habit__name">
          {habit.icon ? <span aria-hidden="true">{habit.icon} </span> : null}
          {habit.name}
          {archived ? " (arquivado)" : ""}
        </p>
        <p className="focus-habit__meta">
          {frequencyText(habit)}
          {" · "}
          {streak.current > 0
            ? `sequência de ${plural(streak.current, unit[0]!, unit[1]!)}`
            : "sem sequência"}
          {streak.best > streak.current ? ` · melhor ${streak.best}` : ""}
          {week !== null ? ` · ${week}/${habit.timesPerWeek} nesta semana` : ""}
        </p>

        <div
          className="focus-habit__week"
          role="group"
          aria-label={`Últimos 7 dias de ${habit.name}`}
        >
          {lastDays(today, 7).map((day) => {
            const marked = days?.has(day) ?? false;
            return (
              <button
                key={day}
                type="button"
                className="focus-habit__day"
                aria-pressed={marked}
                aria-label={`${habit.name}, ${longDate(day)}${day === today ? " (hoje)" : ""}`}
                disabled={archived}
                onClick={() => onToggle(day)}
              >
                <span aria-hidden="true">{letterOf(day)}</span>
              </button>
            );
          })}
        </div>

        <div className="focus-habit__actions">
          {!archived ? (
            <button type="button" className="focus-link" onClick={onEdit}>
              Editar
            </button>
          ) : null}
          <button type="button" className="focus-link" onClick={onArchive}>
            {archived ? "Desarquivar" : "Arquivar"}
          </button>
        </div>
      </div>
    </li>
  );
}
