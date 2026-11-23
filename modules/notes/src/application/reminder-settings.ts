import { DEFAULT_DIGEST_TIME, isValidTime } from "./reminders.ts";
import { DEFAULT_LEAD_MINUTES, LEAD_OPTIONS } from "./scheduled-reminders.ts";

/** Preferências de lembretes deste computador (guardadas no navegador do app, por usuário). */
export interface ReminderSettings {
  /** Mostrar o aviso diário como notificação do sistema (além do aviso dentro do app). */
  readonly systemNotifications: boolean;
  /** Horário do aviso diário (`HH:MM`). */
  readonly time: string;
  /** Dia (`AAAA-MM-DD`) do último aviso do sistema, para avisar uma vez por dia. */
  readonly lastDigest: string | null;
  /** Agendar no sistema um aviso para cada tarefa com hora (toca mesmo com o app fechado, no celular). */
  readonly timedNotifications: boolean;
  /** Quantos minutos antes da hora da tarefa o aviso toca (0 = na hora). */
  readonly leadMinutes: number;
}

const KEY = "tramion.reminders";

export const DEFAULT_SETTINGS: ReminderSettings = {
  systemNotifications: true,
  time: DEFAULT_DIGEST_TIME,
  lastDigest: null,
  timedNotifications: true,
  leadMinutes: DEFAULT_LEAD_MINUTES,
};

/** Lê as preferências. Se o armazenamento faltar ou estiver corrompido, usa o padrão. */
export function readReminderSettings(): ReminderSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ReminderSettings>;
    return {
      systemNotifications:
        typeof parsed.systemNotifications === "boolean"
          ? parsed.systemNotifications
          : DEFAULT_SETTINGS.systemNotifications,
      time:
        typeof parsed.time === "string" && isValidTime(parsed.time)
          ? parsed.time
          : DEFAULT_SETTINGS.time,
      lastDigest:
        typeof parsed.lastDigest === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.lastDigest)
          ? parsed.lastDigest
          : null,
      timedNotifications:
        typeof parsed.timedNotifications === "boolean"
          ? parsed.timedNotifications
          : DEFAULT_SETTINGS.timedNotifications,
      leadMinutes:
        typeof parsed.leadMinutes === "number" &&
        (LEAD_OPTIONS as readonly number[]).includes(parsed.leadMinutes)
          ? parsed.leadMinutes
          : DEFAULT_SETTINGS.leadMinutes,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const listeners = new Set<() => void>();

/** Avisa quando as preferências são gravadas (quem agenda as notificações recalcula). Devolve como cancelar. */
export function onReminderSettingsChange(handler: () => void): () => void {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function saveReminderSettings(settings: ReminderSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* sem armazenamento: não lembra */
  }
  listeners.forEach((handler) => handler());
}
