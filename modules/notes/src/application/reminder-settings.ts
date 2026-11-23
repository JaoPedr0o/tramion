import { DEFAULT_DIGEST_TIME, isValidTime } from "./reminders.ts";

/** Preferências de lembretes deste computador (guardadas no navegador do app, por usuário). */
export interface ReminderSettings {
  /** Mostrar o aviso diário como notificação do sistema (além do aviso dentro do app). */
  readonly systemNotifications: boolean;
  /** Horário do aviso diário (`HH:MM`). */
  readonly time: string;
  /** Dia (`AAAA-MM-DD`) do último aviso do sistema, para avisar uma vez por dia. */
  readonly lastDigest: string | null;
}

const KEY = "tramion.reminders";

export const DEFAULT_SETTINGS: ReminderSettings = {
  systemNotifications: true,
  time: DEFAULT_DIGEST_TIME,
  lastDigest: null,
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
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveReminderSettings(settings: ReminderSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* sem armazenamento: não lembra */
  }
}
