import { useEffect } from "react";
import { startAutoSync } from "../application/auto-sync.ts";
import type { NotesUiDeps } from "./deps.ts";

const EDIT_EVENTS = [
  "note.created",
  "note.updated",
  "note.moved",
  "note.deleted",
  "note.restored",
  "note.purged",
] as const;

/** Rede mudou? (Só alguns navegadores informam; nos outros ficam os demais gatilhos.) */
type Connection = EventTarget | undefined;

/**
 * Sincronização automática (celular): sincroniza ao abrir o app, ao voltar para ele, ao entrar numa rede, a cada poucos
 * minutos e logo depois que a pessoa para de editar. Não renderiza nada. No computador não faz nada (ele só atende).
 * Falhas são silenciosas (sem rede, computador desligado): a janela de pareamento mostra o motivo quando pedido na mão.
 */
export function AutoSync({ deps }: { deps: NotesUiDeps }) {
  const { platform, store, events } = deps;

  useEffect(() => {
    if (!platform.syncsAutomatically) return;

    const sync = startAutoSync(async () => {
      const reports = await platform.syncNow();
      const received = reports.filter((r) => r.ok).reduce((total, r) => total + r.applied, 0);
      if (received > 0) {
        store.reload();
        store.notify(
          received === 1
            ? "Sincronizado: 1 alteração recebida."
            : `Sincronizado: ${received} alterações recebidas.`,
        );
      }
    });

    sync.trigger(); // ao abrir
    const onVisible = () => {
      if (document.visibilityState === "visible") sync.trigger();
    };
    const onNetwork = () => sync.trigger();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onNetwork);
    window.addEventListener("online", onNetwork);
    const connection = (navigator as unknown as { connection?: Connection }).connection;
    connection?.addEventListener("change", onNetwork);
    const off = EDIT_EVENTS.map((name) => events.on(name, () => sync.triggerSoon()));

    return () => {
      sync.stop();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onNetwork);
      window.removeEventListener("online", onNetwork);
      connection?.removeEventListener("change", onNetwork);
      off.forEach((unsubscribe) => unsubscribe());
    };
  }, [platform, store, events]);

  return null;
}
