import type { PomodoroSettings } from "./habit.ts";
import {
  endMessage,
  formatClock,
  formatHourMinute,
  kindLabel,
  remainingMs,
  type Timer,
} from "./pomodoro.ts";

/** A notificação FIXA (não dispensável, silenciosa) que fica na barra enquanto o cronômetro roda ou está pausado. */
export interface OngoingNotice {
  readonly title: string;
  readonly body: string;
  /**
   * Hora (ms) até a qual o sistema mostra um cronômetro regressivo nativo na notificação; `null` = sem contagem
   * (pausado). A hora de término no título evita precisar atualizar a notificação a cada segundo.
   */
  readonly countdownTo: number | null;
}

/** O aviso do fim, agendado no sistema para a hora de término (toca mesmo com o app fechado). */
export interface EndNotice {
  /** Hora de término (ms desde 1970). */
  readonly at: number;
  readonly title: string;
  readonly body: string;
  /** Sem som (a pessoa desligou "Som ao terminar"): o aviso ainda aparece e vibra, mas não toca. */
  readonly quiet: boolean;
}

/** Tudo que o sistema deve mostrar/agendar para o cronômetro de agora. É DADO puro: quem executa é a plataforma. */
export interface NotificationPlan {
  readonly ongoing: OngoingNotice | null;
  readonly end: EndNotice | null;
}

export const NO_NOTIFICATIONS: NotificationPlan = { ongoing: null, end: null };

/**
 * O plano de notificações para um cronômetro:
 * - parado: nada (e quem executa cancela o que sobrou);
 * - rodando: notificação fixa "Foco em andamento — termina às 19:15" e o aviso do fim agendado para `endsAt`;
 * - pausado: notificação fixa "Foco — pausado" e NENHUM aviso agendado (pausado nunca termina sozinho).
 * Um cronômetro rodando cujo término já passou não agenda nada (o fim está sendo tratado agora).
 */
export function planNotifications(
  timer: Timer,
  settings: Pick<PomodoroSettings, "sound">,
  now: number,
  timeZone?: string,
): NotificationPlan {
  if (timer.phase === "idle") return NO_NOTIFICATIONS;
  const label = kindLabel(timer.kind);

  if (timer.phase === "paused") {
    return {
      ongoing: {
        title: `${label} — pausado`,
        body: `Restam ${formatClock(remainingMs(timer, now))}. Toque para abrir o Tramion.`,
        countdownTo: null,
      },
      end: null,
    };
  }

  if (timer.endsAt <= now) return NO_NOTIFICATIONS;
  return {
    ongoing: {
      title: `${label} em andamento — termina às ${formatHourMinute(timer.endsAt, timeZone)}`,
      body: "Toque para abrir o Tramion.",
      countdownTo: timer.endsAt,
    },
    end: {
      at: timer.endsAt,
      title: "Tramion · Foco",
      body: endMessage(timer.kind),
      quiet: !settings.sound,
    },
  };
}
