import { FocusIcon } from "./ui/FocusIcon.tsx";
import type { ModuleManifest } from "@tramion/contracts";
import { createHabitsStore } from "./application/habits-store.ts";
import {
  systemClock,
  type Clock,
  type FocusAlarm,
  type FocusGateway,
  type FocusPlatform,
} from "./application/focus-gateway.ts";
import { createPomodoroStore } from "./application/pomodoro-store.ts";
import { createTauriFocusGateway } from "./infrastructure/tauri-focus-gateway.ts";
import { createTauriFocusPlatform } from "./infrastructure/tauri-focus-platform.ts";
import { createWebAlarm } from "./infrastructure/web-alarm.ts";
import { createMain, createTopbar } from "./ui/createMain.tsx";
import "./ui/focus.css";

/**
 * Monta o módulo Foco (pomodoro e hábitos). Ele registra UMA tela, "Foco", que a casca lista no seletor de telas
 * ao lado de "Páginas". Não abre nada sozinho: só existe quando a pessoa escolhe a tela.
 * O gateway, a porta de notificações, o alarme sonoro e o relógio são injetáveis para os testes não precisarem do Tauri.
 *
 * Ao iniciar, o módulo só LÊ o cronômetro guardado (nada é mostrado nem perguntado): se um pomodoro terminou com o app
 * fechado, a sessão é registrada na hora, mesmo que a pessoa não abra a tela Foco.
 */
export function createFocusModule(
  gateway: FocusGateway = createTauriFocusGateway(),
  options: { platform?: FocusPlatform; alarm?: FocusAlarm; clock?: Clock } = {},
): ModuleManifest {
  return {
    id: "focus",
    version: "0.1.0",
    register({ views }) {
      const clock = options.clock ?? systemClock;
      // Os stores vivem no módulo (não na tela): trocar de tela não perde o cronômetro que está rodando.
      const pomodoro = createPomodoroStore({
        gateway,
        platform: options.platform ?? createTauriFocusPlatform(),
        alarm: options.alarm ?? createWebAlarm(),
        clock,
      });
      const habits = createHabitsStore({ gateway, clock });
      void pomodoro.init();
      // Tocar na notificação fixa a faz sumir (o plugin a descarta ao abrir o app): ao voltar para o app, ela é refeita.
      globalThis.document?.addEventListener("visibilitychange", () => {
        if (globalThis.document.visibilityState === "visible") pomodoro.resyncSystem();
      });

      views.register({
        id: "focus",
        title: "Foco",
        icon: FocusIcon,
        topbar: createTopbar(),
        main: createMain({ pomodoro, habits }),
      });
    },
  };
}
