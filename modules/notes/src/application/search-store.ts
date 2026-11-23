/**
 * Se a caixa de busca (Ctrl + K) está aberta. Vive fora do React porque quem abre (a barra lateral e o atalho de
 * teclado) e quem desenha (a área principal) são componentes registrados separadamente, sem um pai em comum.
 */
export interface SearchStore {
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  subscribe(listener: () => void): () => void;
}

export function createSearchStore(): SearchStore {
  let open = false;
  const listeners = new Set<() => void>();
  const set = (next: boolean) => {
    if (next === open) return;
    open = next;
    listeners.forEach((listener) => listener());
  };
  return {
    isOpen: () => open,
    open: () => set(true),
    close: () => set(false),
    toggle: () => set(!open),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
