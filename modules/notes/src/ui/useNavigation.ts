import { useSyncExternalStore } from "react";
import type { NavigationState, NavigationStore } from "../application/navigation-store.ts";

/** Lê o estado de navegação do módulo e re-renderiza quando ele muda. */
export function useNavigation(store: NavigationStore): NavigationState {
  return useSyncExternalStore(store.subscribe, store.getState);
}
