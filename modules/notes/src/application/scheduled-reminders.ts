import type { DueTask } from "../domain/database.ts";
import { localInstant, timePart } from "./date-time.ts";

/** Antecedências oferecidas (minutos antes da hora da tarefa; 0 = na hora). */
export const LEAD_OPTIONS = [0, 5, 10, 15, 30, 60] as const;
export const DEFAULT_LEAD_MINUTES = 10;

/**
 * Máximo de notificações agendadas de uma vez. O Android aguenta centenas de alarmes por app, mas poucos avisos
 * próximos bastam: o plano é refeito sempre que o app abre, edita ou sincroniza.
 */
export const MAX_SCHEDULED = 50;

/** Uma notificação a agendar no sistema. */
export interface ScheduledNotification {
  /** Identificador estável da tarefa (inteiro de 31 bits: é o que o Android aceita). */
  readonly id: number;
  /** O instante do aviso (ms desde 1970). */
  readonly at: number;
  readonly title: string;
  readonly body: string;
  /** A página da tarefa (aberta ao tocar na notificação). */
  readonly taskId: string;
}

/** Inteiro positivo estável (FNV-1a de 32 bits) a partir do id da tarefa. */
export function notificationIdOf(taskId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < taskId.length; index += 1) {
    hash ^= taskId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash & 0x7fffffff;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "Daqui a 10 minutos, às 14:30", "Daqui a 1 hora, às 14:30" ou "Agora, às 14:30". */
export function leadText(leadMinutes: number, time: string): string {
  if (leadMinutes <= 0) return `Agora, às ${time}`;
  const when =
    leadMinutes % 60 === 0
      ? plural(leadMinutes / 60, "hora", "horas")
      : plural(leadMinutes, "minuto", "minutos");
  return `Daqui a ${when}, às ${time}`;
}

/**
 * Calcula as notificações do sistema para as tarefas pendentes COM hora: uma por tarefa, `leadMinutes` antes da hora.
 * Ignora o que já passou (o aviso, não a tarefa) e as tarefas só com data. Devolve só as `limit` mais próximas,
 * em ordem de horário. Função pura: a hora é o relógio local de quem chama.
 */
export function planScheduledNotifications(input: {
  tasks: readonly DueTask[];
  now: number;
  leadMinutes: number;
  limit?: number;
}): ScheduledNotification[] {
  const { tasks, now, leadMinutes, limit = MAX_SCHEDULED } = input;
  const seenTasks = new Set<string>();
  const planned: ScheduledNotification[] = [];
  for (const task of tasks) {
    if (seenTasks.has(task.id)) continue;
    seenTasks.add(task.id);
    const instant = localInstant(task.date);
    const time = timePart(task.date);
    if (instant === null || time === null) continue;
    const at = instant - Math.max(0, leadMinutes) * 60_000;
    if (at <= now) continue;
    planned.push({
      id: notificationIdOf(task.id),
      at,
      title: task.title.trim() === "" ? "Tarefa sem título" : task.title,
      body: `${leadText(leadMinutes, time)} · ${task.databaseTitle}`,
      taskId: task.id,
    });
  }
  planned.sort((a, b) => a.at - b.at || a.taskId.localeCompare(b.taskId));
  const chosen = planned.slice(0, Math.max(0, limit));

  return withUniqueIds(chosen);
}

/**
 * Duas tarefas com o mesmo hash trocariam de notificação entre si: a segunda anda para o próximo número livre.
 * Mantém a ordem e só mexe nos ids repetidos.
 */
export function withUniqueIds(items: readonly ScheduledNotification[]): ScheduledNotification[] {
  const used = new Set<number>();
  return items.map((item) => {
    let id = item.id;
    while (used.has(id)) id = (id + 1) & 0x7fffffff;
    used.add(id);
    return id === item.id ? item : { ...item, id };
  });
}
