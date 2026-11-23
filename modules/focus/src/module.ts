import type { ModuleManifest } from "@tramion/contracts";
import { createHabitsStore } from "./application/habits-store.ts";
import {
  systemClock,
  type Clock,
  type FocusGateway,
  type FocusPlatform,
} from "./application/focus-gateway.ts";
import { createPomodoroStore } from "./application/pomodoro-store.ts";
import { createTauriFocusGateway } from "./infrastructure/tauri-focus-gateway.ts";
import { createTauriFocusPlatform } from "./infrastructure/tauri-focus-platform.ts";
import { createMain, createTopbar } from "./ui/createMain.tsx";
import "./ui/focus.css";

/**
 * Monta o módulo Foco (pomodoro e hábitos). Ele registra UMA tela, "Foco", que a casca lista no seletor de telas
 * ao lado de "Páginas". Não abre nada sozinho: só existe quando a pessoa escolhe a tela.
 * O gateway, a porta de notificações e o relógio são injetáveis para os testes não precisarem do Tauri.
 */
export function createFocusModule(
  gateway: FocusGateway = createTauriFocusGateway(),
  options: { platform?: FocusPlatform; clock?: Clock } = {},
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
        clock,
      });
      const habits = createHabitsStore({ gateway, clock });

      views.register({
        id: "focus",
        title: "Foco",
        topbar: createTopbar(),
        main: createMain({ pomodoro, habits }),
      });
    },
  };
}
