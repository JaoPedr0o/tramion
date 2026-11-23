import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { NotesPlatform } from "../application/notes-platform.ts";
import { toNotesError } from "./notes-error.ts";

/** Cumpre o contrato chamando o plugin Rust do módulo. */
export function createTauriNotesPlatform(): NotesPlatform {
  return {
    async uploadAsset(file) {
      try {
        // Corpo BRUTO (sem converter para JSON, que seria lento para arquivos grandes). O nome vai no
        // cabeçalho, codificado, porque cabeçalhos só aceitam ASCII.
        const bytes = new Uint8Array(await file.arrayBuffer());
        const path = await invoke<string>("plugin:notes|save_asset", bytes, {
          headers: { "x-file-name": encodeURIComponent(file.name) },
        });
        return convertFileSrc(path);
      } catch (error) {
        throw toNotesError(error);
      }
    },

    async exportAll(files) {
      try {
        return await invoke<{ folder: string; written: number }>("plugin:notes|export_all", {
          files,
        });
      } catch (error) {
        throw toNotesError(error);
      }
    },

    onQuickCapture(handler) {
      // `listen` é assíncrono: guardamos a promessa para cancelar mesmo se o cancelamento vier antes do registro.
      const registered = listen("tramion://quick-capture", () => handler()).catch(() => () => {});
      return () => {
        void registered.then((unlisten) => unlisten());
      };
    },

    async notify(title, body) {
      try {
        const granted = (await isPermissionGranted()) || (await requestPermission()) === "granted";
        if (granted) sendNotification({ title, body });
      } catch {
        // Sem notificações do sistema (ou sem permissão), o aviso continua dentro do app.
      }
    },

    async saveMarkdown(title, content) {
      try {
        return await invoke<string>("plugin:notes|save_markdown", { title, content });
      } catch (error) {
        throw toNotesError(error);
      }
    },

    async reportError(message) {
      try {
        await invoke("plugin:notes|report_error", { message });
      } catch {
        // Registrar o erro nunca pode causar outro erro.
      }
    },

    async openExternal(url) {
      try {
        await invoke("plugin:notes|open_external", { url });
      } catch (error) {
        throw toNotesError(error);
      }
    },
  };
}
