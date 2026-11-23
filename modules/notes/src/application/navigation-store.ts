/**
 * Estado de navegação do módulo de notas, COMPARTILHADO entre os espaços da tela (barra lateral, barra
 * superior e área principal). Eles são componentes registrados separadamente e montados pelo app em
 * lugares diferentes, então não têm um pai React em comum: o estado vive aqui, fora do React.
 *
 * É um objeto simples (sem React) para ser testado sozinho; a tela o lê com `useSyncExternalStore`.
 */
export type Mode = "pages" | "trash" | "today" | "graph";

export interface NavigationState {
  readonly mode: Mode;
  /** Página aberta; `null` = nenhuma. */
  readonly selectedId: string | null;
  /** Páginas da árvore que estão expandidas. */
  readonly expanded: ReadonlySet<string>;
  /** Mensagem de falha de uma ação (excluir, mover...), mostrada na área principal. */
  readonly actionError: string | null;
  /** Aviso de sucesso de uma ação (por exemplo, "Salvo em ..."), mostrado na área principal até ser fechado. */
  readonly notice: string | null;
  /** Página cujo histórico de versões está aberto; `null` = nenhum. */
  readonly historyFor: string | null;
  /** Muda quando o conteúdo da página aberta foi trocado por fora (restaurar uma versão): remonta o editor. */
  readonly reloadToken: number;
  /** A janelinha de captura rápida está aberta. */
  readonly captureOpen: boolean;
  /** A janela de parear o celular está aberta. */
  readonly pairingOpen: boolean;
}

export interface NavigationStore {
  /** O mesmo objeto enquanto nada mudar (exigência do `useSyncExternalStore`). */
  getState(): NavigationState;
  subscribe(listener: () => void): () => void;
  /** Abre uma página, volta ao modo "páginas" e deixa abertos os ancestrais indicados. */
  open(id: string, ancestorIds?: readonly string[]): void;
  /** Nenhuma página aberta. */
  close(): void;
  showTrash(): void;
  /** A página "Hoje": tarefas, agenda e páginas recentes. */
  showToday(): void;
  /** O grafo de conexões entre as páginas. */
  showGraph(): void;
  toggle(id: string): void;
  /** Deixa abertas as páginas indicadas (para uma página nova ou movida aparecer na árvore). */
  reveal(ids: readonly string[]): void;
  fail(message: string): void;
  clearError(): void;
  notify(message: string): void;
  showHistory(id: string): void;
  closeHistory(): void;
  /** Remonta a página aberta (depois de restaurar uma versão). */
  reload(): void;
  showCapture(): void;
  closeCapture(): void;
  showPairing(): void;
  closePairing(): void;
  clearNotice(): void;
  /** O editor aberto registra como salvar o que estiver pendente; devolve como desregistrar. */
  registerFlush(flush: () => Promise<void>): () => void;
  /** Salva o que estiver pendente no editor aberto (use antes de excluir a página, por exemplo). */
  flush(): Promise<void>;
}

const union = (a: ReadonlySet<string>, ids: readonly string[]): ReadonlySet<string> =>
  new Set([...a, ...ids]);

export function createNavigationStore(): NavigationStore {
  let state: NavigationState = {
    mode: "pages",
    selectedId: null,
    expanded: new Set(),
    actionError: null,
    notice: null,
    historyFor: null,
    reloadToken: 0,
    captureOpen: false,
    pairingOpen: false,
  };
  const listeners = new Set<() => void>();
  let pendingFlush: (() => Promise<void>) | null = null;

  const update = (patch: Partial<NavigationState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    open(id, ancestorIds = []) {
      update({
        mode: "pages",
        selectedId: id,
        expanded: union(state.expanded, ancestorIds),
        actionError: null,
      });
    },

    close() {
      update({ selectedId: null });
    },

    showTrash() {
      update({ mode: "trash", selectedId: null, actionError: null });
    },

    showGraph() {
      update({ mode: "graph", selectedId: null, actionError: null });
    },

    showToday() {
      update({ mode: "today", selectedId: null, actionError: null });
    },

    toggle(id) {
      const next = new Set(state.expanded);
      if (!next.delete(id)) next.add(id);
      update({ expanded: next });
    },

    reveal(ids) {
      update({ expanded: union(state.expanded, ids) });
    },

    fail(message) {
      update({ actionError: message });
    },

    showHistory(id) {
      update({ historyFor: id });
    },

    closeHistory() {
      if (state.historyFor !== null) update({ historyFor: null });
    },

    showCapture() {
      update({ captureOpen: true });
    },

    showPairing() {
      update({ pairingOpen: true });
    },

    closePairing() {
      if (state.pairingOpen) update({ pairingOpen: false });
    },

    closeCapture() {
      if (state.captureOpen) update({ captureOpen: false });
    },

    reload() {
      update({ reloadToken: state.reloadToken + 1 });
    },

    notify(message) {
      update({ notice: message, actionError: null });
    },

    clearNotice() {
      if (state.notice !== null) update({ notice: null });
    },

    clearError() {
      if (state.actionError !== null) update({ actionError: null });
    },

    registerFlush(flush) {
      pendingFlush = flush;
      return () => {
        if (pendingFlush === flush) pendingFlush = null;
      };
    },

    async flush() {
      await pendingFlush?.();
    },
  };
}
