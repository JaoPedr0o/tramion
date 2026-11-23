import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { FocusPlatform } from "../application/focus-gateway.ts";

/** A porta do sistema para o módulo Foco: notificações do sistema operacional. */
export function createTauriFocusPlatform(): FocusPlatform {
  return {
    async notify(title, body) {
      try {
        const granted = (await isPermissionGranted()) || (await requestPermission()) === "granted";
        if (granted) sendNotification({ title, body });
      } catch {
        // Sem notificações do sistema (ou sem permissão), o aviso continua dentro do app.
      }
    },
  };
}
