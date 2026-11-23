import { useEffect, useState } from "react";
import { dailyCounts, lastDays, streakOf, type HabitsStore } from "../application/habits-store.ts";
import type { Day } from "../domain/day.ts";
import type { Habit } from "../domain/habit.ts";
import { checksInWeek } from "../domain/streak.ts";
import { HabitDialog } from "./HabitDialog.tsx";
import { Heatmap, longDate } from "./Heatmap.tsx";
import { useStore, useTicker } from "./hooks.ts";
import { ArchiveIcon, CheckIcon, EditIcon, FlameIcon, PlusIcon, SproutIcon } from "./icons.tsx";
import { messageFor } from "./messages.ts";

const WEEKDAY_LETTER = ["D", "S", "T", "Q", "Q", "S", "S"];
/** Quantas cores de destaque existem (as variáveis `--focus-hue-1` a `--focus-hue-6` no CSS). */
const HUES = 6;

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

/** A cor de destaque de um hábito: sempre a mesma (vem do id), de uma paleta pequena. De 1 a 6. */
export function hueOf(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % HUES) + 1;
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
    <section className="focus-habits" aria-labelledby="focus-habits-title">
      <div className="focus-habits__head">
        <h2 id="focus-habits-title" className="focus-title">
          Hábitos
        </h2>
        <button
          type="button"
          className="focus-btn focus-btn--primary"
          onClick={() => setEditing("new")}
        >
          <PlusIcon />
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
        <div className="focus-emptystate">
          <SproutIcon />
          <p className="focus-empty">
            {snap.showArchived
              ? "Nenhum hábito por aqui."
              : "Nenhum hábito ainda. Crie um quando quiser."}
          </p>
        </div>
      ) : null}

      <ul className="focus-habit-list" aria-label="Seus hábitos">
        {snap.habits.map((habit) => (
          <HabitCard
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

      {active.length > 0 ? <Heatmap counts={counts} total={active.length} today={today} /> : null}

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

interface CardProps {
  habit: Habit;
  days: ReadonlySet<Day> | undefined;
  today: Day;
  onToggle: (day: Day) => void;
  onEdit: () => void;
  onArchive: () => void;
}

function HabitCard({ habit, days, today, onToggle, onEdit, onArchive }: CardProps) {
  const archived = habit.archivedAt !== null;
  const done = days?.has(today) ?? false;
  const streak = streakOf(habit, days, today);
  const unit = streak.unit === "weeks" ? ["semana", "semanas"] : ["dia", "dias"];
  const week = habit.frequency === "weekly" ? checksInWeek(days ?? [], today) : null;

  return (
    <li
      className="focus-habit"
      data-hue={hueOf(habit.id)}
      data-done={done ? "true" : undefined}
      data-archived={archived ? "true" : undefined}
    >
      <div className="focus-habit__top">
        {habit.icon ? (
          <span className="focus-habit__icon" aria-hidden="true">
            {habit.icon}
          </span>
        ) : null}
        <div className="focus-habit__title">
          <p className="focus-habit__name">
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
        </div>
        <div className="focus-streak" data-active={streak.current > 0} aria-hidden="true">
          <FlameIcon width={18} height={18} />
          <span>{streak.current}</span>
        </div>
      </div>

      <button
        type="button"
        className="focus-habit__check"
        aria-pressed={done}
        aria-label={`${habit.name}: ${done ? "feito hoje (desmarcar)" : "marcar hoje"}`}
        disabled={archived}
        onClick={() => onToggle(today)}
      >
        <span className="focus-habit__checkmark" aria-hidden="true">
          {done ? <CheckIcon /> : null}
        </span>
        <span aria-hidden="true">{done ? "Feito hoje" : "Marcar hoje"}</span>
      </button>

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
              data-today={day === today ? "true" : undefined}
              aria-pressed={marked}
              aria-label={`${habit.name}, ${longDate(day)}${day === today ? " (hoje)" : ""}`}
              disabled={archived}
              onClick={() => onToggle(day)}
            >
              <span className="focus-habit__dot" aria-hidden="true" />
              <span className="focus-habit__letter" aria-hidden="true">
                {letterOf(day)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="focus-habit__actions">
        {!archived ? (
          <button type="button" className="focus-link" onClick={onEdit}>
            <EditIcon width={16} height={16} />
            Editar
          </button>
        ) : null}
        <button type="button" className="focus-link" onClick={onArchive}>
          <ArchiveIcon width={16} height={16} />
          {archived ? "Desarquivar" : "Arquivar"}
        </button>
      </div>
    </li>
  );
}
