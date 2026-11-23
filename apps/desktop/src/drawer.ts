import { useEffect, useSyncExternalStore } from "react";

/**
 * Telas de celular: abaixo de 720 px de largura a barra lateral vira uma gaveta por cima do conteúdo. O computador
 * nunca chega aqui (a janela tem largura mínima de 720 px).
 */
export const NARROW_SCREEN = "(max-width: 719px)";

export function isNarrowScreen(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(NARROW_SCREEN).matches;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(NARROW_SCREEN);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

/** `true` enquanto a tela é estreita (e acompanha girar o aparelho ou redimensionar a janela). */
export function useNarrowScreen(): boolean {
  return useSyncExternalStore(subscribe, isNarrowScreen, () => false);
}

/**
 * A faixa, perto da borda esquerda, onde começar a arrastar abre a gaveta. Ela NÃO começa na borda: os primeiros
 * pixels pertencem ao gesto de "voltar" do Android, que fecharia o app em vez de abrir a gaveta.
 */
export const EDGE_MIN_PX = 28;
export const EDGE_MAX_PX = 120;
/** Quanto é preciso arrastar na horizontal para valer como gesto. */
export const MIN_SWIPE_PX = 56;
/** Se o dedo desvia mais que isto na vertical, é rolagem, não gesto. */
export const MAX_DRIFT_PX = 48;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** O que um arrastar de `start` até `end` significa: abrir a gaveta (a partir da borda), fechá-la ou nada. */
export function swipeAction(
  start: Point,
  end: Point,
  drawerOpen: boolean,
): "open" | "close" | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dy) > MAX_DRIFT_PX || Math.abs(dy) > Math.abs(dx)) return null;
  if (drawerOpen && dx <= -MIN_SWIPE_PX) return "close";
  if (!drawerOpen && start.x >= EDGE_MIN_PX && start.x <= EDGE_MAX_PX && dx >= MIN_SWIPE_PX)
    return "open";
  return null;
}

/** Arrastar a partir da faixa da borda esquerda abre a gaveta; arrastar para a esquerda com ela aberta a fecha. */
export function useDrawerGestures(
  enabled: boolean,
  drawerOpen: boolean,
  onOpen: () => void,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!enabled) return;
    let start: Point | null = null;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      start = touch && event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null;
    };
    const onEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      const from = start;
      start = null;
      if (!from || !touch) return;
      const action = swipeAction(from, { x: touch.clientX, y: touch.clientY }, drawerOpen);
      if (action === "open") onOpen();
      else if (action === "close") onClose();
    };
    const onCancel = () => {
      start = null;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };
  }, [enabled, drawerOpen, onOpen, onClose]);
}
