import { useEffect } from "react";
import { CHANGE_EVENTS } from "../application/change-events.ts";
import { createReminderScheduler } from "../application/reminder-scheduler.ts";
import {
  onReminderSettingsChange,
  readReminderSettings,
} from "../application/reminder-settings.ts";
import type { NotesUiDeps } from "./deps.ts";

/** Pausa depois da última edição antes de refazer o plano (uma digitação gera muitas edições seguidas). */
const DEBOUNCE_MS = 1500;

/**
 * Mantém os avisos do sistema (que tocam com o app fechado, no celular) iguais às tarefas com hora: refaz o plano ao
 * abrir o app, ao voltar para ele, depois de editar ou sincronizar e quando as preferências mudam. Também abre a
 * página da tarefa quando a pessoa toca na notificação. Não renderiza nada; no computador não faz nada.
 */
export function ReminderScheduler({ deps }: { deps: NotesUiDeps }) {
  const { service, events, platform, actions } = deps;

  useEffect(() => {
    if (!platform.canScheduleNotifications) return;
    const scheduler = createReminderScheduler({
      service,
      platform,
      settings: readReminderSettings,
    });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void scheduler.run();
      }, DEBOUNCE_MS);
    };
    const now = () => void scheduler.run();

    const first = setTimeout(now, 0); // ao abrir
    const onVisible = () => {
      if (document.visibilityState === "visible") soon();
    };
    document.addEventListener("visibilitychange", onVisible);
    const off = CHANGE_EVENTS.map((name) => events.on(name, soon));
    const offSettings = onReminderSettingsChange(now);
    const offTap = platform.onNotificationOpened((taskId) => {
      void service
        .list()
        .then((pages) => {
          if (pages.some((page) => page.id === taskId)) actions.openPage(taskId, pages);
        })
        .catch(() => {});
    });

    return () => {
      clearTimeout(first);
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      off.forEach((unsubscribe) => unsubscribe());
      offSettings();
      offTap();
    };
  }, [service, events, platform, actions]);

  return null;
}
