import * as realPlugin from "@tauri-apps/plugin-notification";
import { describe, expect, it, vi } from "vitest";
import type { NotificationPlan } from "../domain/notification-plan.ts";
import {
  END_CHANNEL,
  END_NOTIFICATION_ID,
  END_QUIET_CHANNEL,
  END_SOUND,
  ONGOING_CHANNEL,
  ONGOING_NOTIFICATION_ID,
  SILENT_SOUND,
  createTauriFocusPlatform,
  type NotificationPlugin,
} from "./tauri-focus-platform.ts";

const END_AT = Date.UTC(2026, 10, 18, 22, 25, 0);

const RUNNING: NotificationPlan = {
  ongoing: {
    title: "Foco em andamento — termina às 19:25",
    body: "Toque para abrir o Tramion.",
    countdownTo: END_AT,
  },
  end: {
    at: END_AT,
    title: "Tramion · Foco",
    body: "Sessão de foco concluída. Hora de uma pausa.",
    quiet: false,
  },
};

/** O plugin falso: guarda o que foi pedido, com enums e `Schedule` reais. */
function fakePlugin(options: { granted?: boolean; pending?: { id: number; at: Date }[] } = {}) {
  const plugin = {
    Importance: realPlugin.Importance,
    Visibility: realPlugin.Visibility,
    Schedule: realPlugin.Schedule,
    isPermissionGranted: vi.fn(async () => options.granted ?? true),
    requestPermission: vi.fn(async () => (options.granted === false ? "denied" : "granted")),
    createChannel: vi.fn<NotificationPlugin["createChannel"]>(async () => {}),
    sendNotification: vi.fn(),
    pending: vi.fn(async () =>
      (options.pending ?? []).map((entry) => ({
        id: entry.id,
        schedule: { at: { date: entry.at, repeating: false, allowWhileIdle: true } },
      })),
    ),
    cancel: vi.fn(async () => {}),
  };
  return plugin as typeof plugin & NotificationPlugin;
}

function setup(options: Parameters<typeof fakePlugin>[0] = {}, isMobile = true) {
  const plugin = fakePlugin(options);
  const scheduleBatch = vi.fn<(notifications: unknown[]) => Promise<void>>(async () => {});
  const platform = createTauriFocusPlatform({
    isMobile,
    loadPlugin: async () => plugin,
    scheduleBatch,
  });
  return { plugin, scheduleBatch, platform };
}

describe("porta do sistema (Tauri) do Foco", () => {
  it("no celular o sistema avisa o fim sozinho; no computador não", () => {
    expect(setup({}, true).platform.systemAlarm).toBe(true);
    expect(setup({}, false).platform.systemAlarm).toBe(false);
  });

  it("cria os canais: alto com som e vibração, mudo, e o silencioso de baixa importância", async () => {
    const { platform, plugin } = setup();
    await platform.syncTimerNotifications(RUNNING);

    const channels = new Map(
      plugin.createChannel.mock.calls.map(([channel]) => [channel.id, channel]),
    );
    expect(channels.get(END_CHANNEL)).toMatchObject({
      importance: realPlugin.Importance.High,
      sound: END_SOUND,
      vibration: true,
    });
    expect(END_CHANNEL).toBe("foco-fim-v1");
    expect(END_SOUND).toBe("pomodoro_end");
    expect(channels.get(END_QUIET_CHANNEL)).toMatchObject({
      importance: realPlugin.Importance.High,
      sound: SILENT_SOUND,
    });
    expect(channels.get(ONGOING_CHANNEL)).toMatchObject({
      importance: realPlugin.Importance.Low,
      vibration: false,
    });
    expect(channels.get(ONGOING_CHANNEL)?.sound).toBeUndefined();
  });

  it("rodando: mostra a notificação fixa com contagem regressiva e agenda o aviso (alarme em modo Doze incluso)", async () => {
    const { platform, plugin, scheduleBatch } = setup();
    await platform.syncTimerNotifications(RUNNING);

    expect(plugin.sendNotification).toHaveBeenCalledWith({
      id: ONGOING_NOTIFICATION_ID,
      channelId: ONGOING_CHANNEL,
      title: "Foco em andamento — termina às 19:25",
      body: "Toque para abrir o Tramion.",
      sound: SILENT_SOUND,
      ongoing: true,
      autoCancel: false,
      when: END_AT,
      usesChronometer: true,
      chronometerCountDown: true,
    });
    expect(scheduleBatch).toHaveBeenCalledWith([
      {
        id: END_NOTIFICATION_ID,
        channelId: END_CHANNEL,
        title: "Tramion · Foco",
        body: "Sessão de foco concluída. Hora de uma pausa.",
        sound: END_SOUND,
        autoCancel: true,
        schedule: {
          at: { date: new Date(END_AT).toISOString(), repeating: false, allowWhileIdle: true },
        },
      },
    ]);
    expect(END_NOTIFICATION_ID).not.toBe(ONGOING_NOTIFICATION_ID);
  });

  it("som desligado usa o canal mudo", async () => {
    const { platform, scheduleBatch } = setup();
    await platform.syncTimerNotifications({
      ...RUNNING,
      end: { ...RUNNING.end!, quiet: true },
    });
    expect(scheduleBatch.mock.calls[0]?.[0]).toMatchObject([
      { channelId: END_QUIET_CHANNEL, sound: SILENT_SOUND },
    ]);
  });

  it("se o `batch` falhar, cai no agendamento do plugin com `Schedule.at(..., allowWhileIdle)`", async () => {
    const { platform, plugin, scheduleBatch } = setup();
    scheduleBatch.mockRejectedValue(new Error("sem batch"));
    await platform.syncTimerNotifications(RUNNING);

    const scheduled = plugin.sendNotification.mock.calls
      .map(([options]) => options)
      .find((options) => options.id === END_NOTIFICATION_ID);
    expect(scheduled?.schedule).toMatchObject({
      at: { date: new Date(END_AT), repeating: false, allowWhileIdle: true },
    });
  });

  it("não reagenda o que já está agendado para a mesma hora", async () => {
    const { platform, scheduleBatch } = setup({
      pending: [{ id: END_NOTIFICATION_ID, at: new Date(END_AT) }],
    });
    await platform.syncTimerNotifications(RUNNING);
    expect(scheduleBatch).not.toHaveBeenCalled();
  });

  it("pausado: troca a notificação (sem contagem) e cancela o aviso agendado", async () => {
    const { platform, plugin, scheduleBatch } = setup({
      pending: [{ id: END_NOTIFICATION_ID, at: new Date(END_AT) }],
    });
    await platform.syncTimerNotifications({
      ongoing: { title: "Foco — pausado", body: "Restam 15:00.", countdownTo: null },
      end: null,
    });
    const shown = plugin.sendNotification.mock.calls[0]?.[0];
    expect(shown).toMatchObject({ id: ONGOING_NOTIFICATION_ID, ongoing: true });
    expect(shown).not.toHaveProperty("usesChronometer");
    expect(plugin.cancel).toHaveBeenCalledWith([END_NOTIFICATION_ID]);
    expect(scheduleBatch).not.toHaveBeenCalled();
  });

  it("sem plano (parado ou cancelado): tira a notificação fixa; só cancela o aviso se ainda estiver agendado", async () => {
    const withPending = setup({ pending: [{ id: END_NOTIFICATION_ID, at: new Date(END_AT) }] });
    await withPending.platform.syncTimerNotifications({ ongoing: null, end: null });
    expect(withPending.plugin.cancel).toHaveBeenCalledWith([ONGOING_NOTIFICATION_ID]);
    expect(withPending.plugin.cancel).toHaveBeenCalledWith([END_NOTIFICATION_ID]);
    expect(withPending.plugin.createChannel).not.toHaveBeenCalled();
    expect(withPending.plugin.requestPermission).not.toHaveBeenCalled();

    // Já disparou (não está mais agendado): cancelar apagaria o aviso que a pessoa precisa ver.
    const fired = setup();
    await fired.platform.syncTimerNotifications({ ongoing: null, end: null });
    expect(fired.plugin.cancel).toHaveBeenCalledTimes(1);
    expect(fired.plugin.cancel).toHaveBeenCalledWith([ONGOING_NOTIFICATION_ID]);
  });

  it("clearOngoing tira só a notificação fixa", async () => {
    const { platform, plugin } = setup();
    await platform.clearOngoing();
    expect(plugin.cancel).toHaveBeenCalledTimes(1);
    expect(plugin.cancel).toHaveBeenCalledWith([ONGOING_NOTIFICATION_ID]);
  });

  it("pede permissão ao iniciar; sem ela, não agenda nada (e não lança)", async () => {
    const { platform, plugin, scheduleBatch } = setup({ granted: false });
    await expect(platform.syncTimerNotifications(RUNNING)).resolves.toBeUndefined();
    expect(plugin.requestPermission).toHaveBeenCalled();
    expect(plugin.sendNotification).not.toHaveBeenCalled();
    expect(scheduleBatch).not.toHaveBeenCalled();
  });

  it("no computador não agenda nem mostra nada (o plugin ignoraria o horário)", async () => {
    const { platform, plugin, scheduleBatch } = setup({}, false);
    await platform.syncTimerNotifications(RUNNING);
    await platform.clearOngoing();
    expect(plugin.sendNotification).not.toHaveBeenCalled();
    expect(plugin.cancel).not.toHaveBeenCalled();
    expect(scheduleBatch).not.toHaveBeenCalled();
  });

  it("falhas do plugin nunca lançam", async () => {
    const { platform, plugin } = setup();
    plugin.pending.mockRejectedValue(new Error("boom"));
    await expect(platform.syncTimerNotifications(RUNNING)).resolves.toBeUndefined();
  });

  it("notify: só envia com permissão", async () => {
    const granted = setup();
    await granted.platform.notify("T", "B");
    expect(granted.plugin.sendNotification).toHaveBeenCalledWith({ title: "T", body: "B" });

    const denied = setup({ granted: false });
    await denied.platform.notify("T", "B");
    expect(denied.plugin.sendNotification).not.toHaveBeenCalled();
  });
});
