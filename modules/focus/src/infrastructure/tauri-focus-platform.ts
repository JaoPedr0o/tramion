import { invoke } from "@tauri-apps/api/core";
import type { FocusPlatform } from "../application/focus-gateway.ts";
import type { NotificationPlan } from "../domain/notification-plan.ts";

/** A parte do plugin de notificações que o módulo usa (o módulo inteiro do plugin cabe aqui; os testes trocam por um falso). */
export type NotificationPlugin = Pick<
  typeof import("@tauri-apps/plugin-notification"),
  | "isPermissionGranted"
  | "requestPermission"
  | "createChannel"
  | "sendNotification"
  | "pending"
  | "cancel"
  | "Importance"
  | "Visibility"
  | "Schedule"
>;

/**
 * Ids (inteiros de 32 bits, exigência do Android) das duas notificações do pomodoro. Ficam numa faixa própria para não
 * colidir com os lembretes das notas. Precisam ser DIFERENTES: agendar ou mostrar uma notificação com um id cancela a
 * que já usa o mesmo id.
 */
export const END_NOTIFICATION_ID = 1_940_001;
export const ONGOING_NOTIFICATION_ID = 1_940_002;

/**
 * Canais do Android (as ids têm versão: o som e a importância de um canal só valem NA PRIMEIRA CRIAÇÃO e o Android não
 * deixa mudar depois; para mudar, é preciso um id novo, por exemplo `foco-fim-v2`, e a pessoa vê o canal antigo
 * nos ajustes do aparelho até desinstalar):
 * - fim com som: importância ALTA (aparece na tela e toca), som `res/raw/pomodoro_end.wav` e vibração;
 * - fim sem som ("Som ao terminar" desligado): igual, mas com um arquivo mudo (o plugin não sabe criar canal sem som);
 * - em andamento: importância BAIXA (silenciosa, sem aparecer por cima).
 */
export const END_CHANNEL = "foco-fim-v1";
export const END_QUIET_CHANNEL = "foco-fim-mudo-v1";
export const ONGOING_CHANNEL = "foco-andamento-v1";
export const END_SOUND = "pomodoro_end";
export const SILENT_SOUND = "pomodoro_silent";

export interface TauriFocusPlatformDeps {
  /** Só o celular agenda e mantém notificações fixas; no computador o plugin ignoraria o horário. */
  readonly isMobile: boolean;
  /** Carrega o plugin sob demanda (o app do computador nem toca nele). */
  readonly loadPlugin: () => Promise<NotificationPlugin>;
  /** Agenda notificações guardando-as também para voltarem depois de reiniciar o aparelho. */
  readonly scheduleBatch: (notifications: unknown[]) => Promise<void>;
}

const defaultDeps: TauriFocusPlatformDeps = {
  isMobile: /Android|iPhone|iPad/i.test(globalThis.navigator?.userAgent ?? ""),
  loadPlugin: () => import("@tauri-apps/plugin-notification"),
  scheduleBatch: (notifications) => invoke("plugin:notification|batch", { notifications }),
};

/** A porta do sistema para o módulo Foco: notificações do sistema operacional. */
export function createTauriFocusPlatform(
  deps: TauriFocusPlatformDeps = defaultDeps,
): FocusPlatform {
  let channelsReady = false;

  async function ensureChannels(plugin: NotificationPlugin) {
    if (channelsReady) return;
    await plugin.createChannel({
      id: END_CHANNEL,
      name: "Fim do pomodoro",
      description: "Toca um sino e vibra quando o foco ou a pausa termina",
      importance: plugin.Importance.High,
      visibility: plugin.Visibility.Public,
      sound: END_SOUND,
      vibration: true,
    });
    await plugin.createChannel({
      id: END_QUIET_CHANNEL,
      name: "Fim do pomodoro (sem som)",
      description: "Avisa e vibra sem tocar o sino (quando o som está desligado nos ajustes)",
      importance: plugin.Importance.High,
      visibility: plugin.Visibility.Public,
      sound: SILENT_SOUND,
      vibration: true,
    });
    await plugin.createChannel({
      id: ONGOING_CHANNEL,
      name: "Pomodoro em andamento",
      description: "Mostra que o cronômetro está rodando, sem som",
      importance: plugin.Importance.Low,
      visibility: plugin.Visibility.Public,
      vibration: false,
    });
    channelsReady = true;
  }

  return {
    systemAlarm: deps.isMobile,

    async notify(title, body) {
      try {
        const plugin = await deps.loadPlugin();
        const granted =
          (await plugin.isPermissionGranted()) || (await plugin.requestPermission()) === "granted";
        if (granted) plugin.sendNotification({ title, body });
      } catch {
        // Sem notificações do sistema (ou sem permissão), o aviso continua dentro do app.
      }
    },

    async syncTimerNotifications(plan: NotificationPlan) {
      if (!deps.isMobile) return;
      try {
        const plugin = await deps.loadPlugin();
        const wanted = plan.ongoing !== null || plan.end !== null;
        if (wanted && !(await plugin.isPermissionGranted())) {
          if ((await plugin.requestPermission()) !== "granted") return;
        }
        if (wanted) await ensureChannels(plugin);

        // Notificação fixa (silenciosa, não dispensável; tocar nela abre o app).
        if (plan.ongoing) {
          const { title, body, countdownTo } = plan.ongoing;
          plugin.sendNotification({
            id: ONGOING_NOTIFICATION_ID,
            channelId: ONGOING_CHANNEL,
            title,
            body,
            sound: SILENT_SOUND,
            ongoing: true,
            autoCancel: false,
            // Contagem regressiva nativa (o sistema atualiza sozinho, sem o app rodando).
            ...(countdownTo !== null
              ? { when: countdownTo, usesChronometer: true, chronometerCountDown: true }
              : {}),
          });
        } else {
          await plugin.cancel([ONGOING_NOTIFICATION_ID]);
        }

        // Aviso do fim, agendado no alarme do sistema (toca com o app fechado).
        const pending = (await plugin.pending()).find((entry) => entry.id === END_NOTIFICATION_ID);
        if (!plan.end) {
          // Só cancela se ainda estiver agendado: depois de disparar, cancelar apagaria o aviso que a pessoa precisa ver.
          if (pending) await plugin.cancel([END_NOTIFICATION_ID]);
          return;
        }
        const date = pending?.schedule?.at?.date as Date | string | undefined;
        if (pending && date !== undefined && new Date(date).getTime() === plan.end.at) return;

        const channelId = plan.end.quiet ? END_QUIET_CHANNEL : END_CHANNEL;
        const sound = plan.end.quiet ? SILENT_SOUND : END_SOUND;
        try {
          await deps.scheduleBatch([
            {
              id: END_NOTIFICATION_ID,
              channelId,
              title: plan.end.title,
              body: plan.end.body,
              sound,
              autoCancel: true,
              schedule: {
                at: {
                  date: new Date(plan.end.at).toISOString(),
                  repeating: false,
                  allowWhileIdle: true,
                },
              },
            },
          ]);
        } catch {
          plugin.sendNotification({
            id: END_NOTIFICATION_ID,
            channelId,
            title: plan.end.title,
            body: plan.end.body,
            sound,
            autoCancel: true,
            schedule: plugin.Schedule.at(new Date(plan.end.at), false, true),
          });
        }
      } catch {
        // Sem plugin, sem permissão ou sem resposta agora: o plano é refeito na próxima mudança ou abertura do app.
      }
    },

    async clearOngoing() {
      if (!deps.isMobile) return;
      try {
        const plugin = await deps.loadPlugin();
        await plugin.cancel([ONGOING_NOTIFICATION_ID]);
      } catch {
        // Nada a fazer: a próxima abertura do app limpa o que sobrou.
      }
    },
  };
}
