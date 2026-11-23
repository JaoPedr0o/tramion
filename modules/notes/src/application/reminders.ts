import type { DueTask } from "../domain/database.ts";
import { todayIso } from "./calendar.ts";

/** Horário padrão do aviso diário do sistema. */
export const DEFAULT_DIGEST_TIME = "09:00";

/** `HH:MM` válido (00:00 a 23:59)? */
export const isValidTime = (time: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

/** Quantos minutos desde a meia-noite (`HH:MM`), ou `null` se o texto não for um horário válido. */
export function minutesOf(time: string): number | null {
  if (!isValidTime(time)) return null;
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
}

/**
 * O aviso do sistema deve aparecer agora? Só uma vez por dia: já passou do horário combinado, ainda não avisou hoje e
 * há tarefas pedindo atenção. (Se o app só abriu depois do horário, avisa na abertura.)
 */
export function isDigestDue(input: {
  now: Date;
  time: string;
  lastDigest: string | null;
  count: number;
}): boolean {
  const target = minutesOf(input.time);
  if (target === null || input.count === 0) return false;
  if (input.lastDigest === todayIso(input.now)) return false;
  return input.now.getHours() * 60 + input.now.getMinutes() >= target;
}

/** As tarefas separadas em atrasadas e de hoje. */
export function splitDue(tasks: readonly DueTask[]): { overdue: DueTask[]; today: DueTask[] } {
  return {
    overdue: tasks.filter((task) => task.overdue),
    today: tasks.filter((task) => !task.overdue),
  };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** O texto do aviso do sistema: "3 tarefas pedem atenção" e o detalhe com os primeiros títulos. */
export function digestMessage(tasks: readonly DueTask[]): { title: string; body: string } {
  const { overdue, today } = splitDue(tasks);
  const title =
    tasks.length === 1 ? "1 tarefa pede atenção" : `${tasks.length} tarefas pedem atenção`;
  const parts = [
    overdue.length > 0 ? plural(overdue.length, "atrasada", "atrasadas") : null,
    today.length > 0 ? `${plural(today.length, "vence", "vencem")} hoje` : null,
  ].filter((part): part is string => part !== null);
  const names = tasks.slice(0, 3).map((task) => task.title);
  const more = tasks.length > 3 ? ` e mais ${tasks.length - 3}` : "";
  return { title, body: `${parts.join(" · ")}: ${names.join(", ")}${more}` };
}
