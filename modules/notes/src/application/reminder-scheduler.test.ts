import { describe, expect, it, vi } from "vitest";
import type { DueTask } from "../domain/database.ts";
import { createReminderScheduler } from "./reminder-scheduler.ts";
import { DEFAULT_SETTINGS, type ReminderSettings } from "./reminder-settings.ts";
import type { ScheduledNotification } from "./scheduled-reminders.ts";

const NOW = new Date(2026, 10, 24, 12, 0);

const task = (id: string, date: string): DueTask => ({
  id,
  title: `Tarefa ${id}`,
  icon: null,
  databaseId: "db",
  databaseTitle: "Tarefas",
  date,
  overdue: false,
});

function setup(
  options: {
    due?: DueTask[];
    upcoming?: DueTask[];
    settings?: Partial<ReminderSettings>;
    can?: boolean;
  } = {},
) {
  const scheduled: (readonly ScheduledNotification[])[] = [];
  const service = {
    dueTasks: vi.fn<(today: string) => Promise<DueTask[]>>(async () => options.due ?? []),
    upcomingTasks: vi.fn<(today: string, days: number) => Promise<DueTask[]>>(
      async () => options.upcoming ?? [],
    ),
  };
  const platform = {
    canScheduleNotifications: options.can ?? true,
    scheduleNotifications: vi.fn(async (items: readonly ScheduledNotification[]) => {
      scheduled.push(items);
    }),
  };
  const scheduler = createReminderScheduler({
    service,
    platform,
    settings: () => ({ ...DEFAULT_SETTINGS, ...options.settings }),
    now: () => NOW,
  });
  return { scheduler, service, platform, scheduled };
}

describe("agendador de avisos", () => {
  it("junta atrasadas/de hoje e próximas, e agenda só as com hora", async () => {
    const { scheduler, scheduled, service } = setup({
      due: [task("hoje", "2026-11-24T18:00"), task("sem-hora", "2026-11-24")],
      upcoming: [task("amanha", "2026-11-25T09:00")],
    });

    await scheduler.run();

    expect(service.dueTasks).toHaveBeenCalledWith("2026-11-24");
    expect(service.upcomingTasks).toHaveBeenCalledWith("2026-11-24", 60);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.map((i) => i.taskId)).toEqual(["hoje", "amanha"]);
    expect(scheduled[0]![0]!.at).toBe(new Date(2026, 10, 24, 17, 50).getTime()); // 10 min antes
  });

  it("usa a antecedência das preferências", async () => {
    const { scheduler, scheduled } = setup({
      due: [task("a", "2026-11-24T18:00")],
      settings: { leadMinutes: 60 },
    });

    await scheduler.run();

    expect(scheduled[0]![0]!.at).toBe(new Date(2026, 10, 24, 17, 0).getTime());
  });

  it("desligado: entrega lista vazia (cancela tudo) sem nem olhar as tarefas", async () => {
    const { scheduler, scheduled, service } = setup({
      due: [task("a", "2026-11-24T18:00")],
      settings: { timedNotifications: false },
    });

    await scheduler.run();

    expect(scheduled).toEqual([[]]);
    expect(service.dueTasks).not.toHaveBeenCalled();
  });

  it("onde não há agendamento (computador), não faz nada", async () => {
    const { scheduler, platform, service } = setup({ can: false });

    await scheduler.run();

    expect(platform.scheduleNotifications).not.toHaveBeenCalled();
    expect(service.dueTasks).not.toHaveBeenCalled();
  });

  it("falha ao ler as tarefas mantém o que já estava agendado e não lança", async () => {
    const { scheduler, platform, service } = setup();
    service.dueTasks.mockRejectedValueOnce(new Error("sem resposta"));

    await expect(scheduler.run()).resolves.toBeUndefined();

    expect(platform.scheduleNotifications).not.toHaveBeenCalled();
  });

  it("chamadas durante uma rodada viram uma rodada a mais, com o estado mais novo", async () => {
    const { scheduler, service, platform } = setup();
    let release: () => void = () => {};
    service.dueTasks.mockImplementationOnce(
      () => new Promise<DueTask[]>((resolve) => (release = () => resolve([]))),
    );

    const first = scheduler.run();
    await vi.waitFor(() => expect(service.dueTasks).toHaveBeenCalledTimes(1));
    // A rodada já leu o estado: estas duas chegam tarde e pedem UMA rodada a mais.
    const second = scheduler.run();
    const third = scheduler.run();
    release();
    await Promise.all([first, second, third]);

    expect(service.dueTasks).toHaveBeenCalledTimes(2);
    expect(platform.scheduleNotifications).toHaveBeenCalledTimes(2);
  });
});
