import { useEffect, useReducer, useSyncExternalStore } from "react";

/** Lê o estado de um store do módulo e re-renderiza quando ele muda. */
export function useStore<S>(store: {
  subscribe(listener: () => void): () => void;
  getSnapshot(): S;
}): S {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

/**
 * Re-renderiza de tempos em tempos (e quando a janela volta a ficar visível) enquanto `active`, chamando `onTick`
 * antes. Quem precisa da hora a lê do relógio na hora de renderizar: o intervalo só diz "olhe de novo".
 */
export function useTicker(active: boolean, intervalMs: number, onTick?: () => void): void {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      onTick?.();
      refresh();
    };
    const timer = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    };
  }, [active, intervalMs, onTick]);
}
