import type { DueTask } from "../domain/database.ts";
import { todayIso } from "./calendar.ts";
import type { NotesPlatform } from "./notes-platform.ts";
import type { NotesService } from "./notes-service.ts";
import type { ReminderSettings } from "./reminder-settings.ts";
import { planScheduledNotifications } from "./scheduled-reminders.ts";

/** Até quantos dias à frente se procura tarefas com hora para agendar (o máximo da agenda). */
export const SCHEDULE_AHEAD_DAYS = 60;

export interface ReminderSchedulerDeps {
  service: Pick<NotesService, "dueTasks" | "upcomingTasks">;
  platform: Pick<NotesPlatform, "canScheduleNotifications" | "scheduleNotifications">;
  settings(): ReminderSettings;
  now?(): Date;
}

/**
 * Mantém os avisos do sistema iguais às tarefas pendentes com hora. `run()` recalcula o plano e o entrega à plataforma
 * (que agenda o novo e cancela o que não vale mais). Chamadas que chegam durante uma rodada viram UMA rodada a mais, no
 * fim, então o último estado sempre vence. Nunca lança: sem resposta agora, o que já estava agendado fica como está.
 */
export function createReminderScheduler(deps: ReminderSchedulerDeps) {
  let running: Promise<void> | null = null;
  let again = false;

  const once = async () => {
    const { service, platform } = deps;
    const settings = deps.settings();
    if (!settings.timedNotifications) {
      await platform.scheduleNotifications([]); // desligado: cancela tudo o que havia
      return;
    }
    const now = deps.now?.() ?? new Date();
    const today = todayIso(now);
    const [due, upcoming] = await Promise.all([
      service.dueTasks(today),
      service.upcomingTasks(today, SCHEDULE_AHEAD_DAYS),
    ]);
    const tasks: readonly DueTask[] = [...due, ...upcoming];
    await platform.scheduleNotifications(
      planScheduledNotifications({
        tasks,
        now: now.getTime(),
        leadMinutes: settings.leadMinutes,
      }),
    );
  };

  const loop = async () => {
    await Promise.resolve(); // garante que `running` já foi atribuído antes de a rodada terminar
    do {
      again = false;
      try {
        if (deps.platform.canScheduleNotifications) await once();
      } catch {
        // Sem resposta agora: o plano é refeito na próxima abertura, edição ou sincronização.
      }
    } while (again);
    running = null; // na mesma passada da conferência acima: nenhuma chamada se perde no intervalo
  };

  return {
    run(): Promise<void> {
      if (running) {
        again = true;
        return running;
      }
      running = loop();
      return running;
    },
  };
}
