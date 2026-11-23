import type { EventBus, Unsubscribe } from "@aesthetic/contracts";

export interface EventBusOptions {
  /**
   * Chamado quando um assinante lança erro. Um assinante com defeito NUNCA deve quebrar
   * quem publicou o evento nem impedir os demais assinantes de receber.
   */
  onHandlerError?: (eventName: string, error: unknown) => void;
}

export function createEventBus<E extends object>(options: EventBusOptions = {}): EventBus<E> {
  const onHandlerError =
    options.onHandlerError ??
    ((eventName, error) => console.error(`Erro em assinante do evento "${eventName}":`, error));

  const handlers = new Map<string, Set<(payload: never) => void>>();

  return {
    on(name, handler): Unsubscribe {
      let set = handlers.get(name);
      if (!set) {
        set = new Set();
        handlers.set(name, set);
      }
      set.add(handler);
      return () => {
        set.delete(handler);
      };
    },

    emit(name, payload): void {
      // Copia antes de percorrer: assinar ou cancelar durante a publicação é seguro.
      for (const handler of [...(handlers.get(name) ?? [])]) {
        try {
          handler(payload as never);
        } catch (error) {
          onHandlerError(name, error);
        }
      }
    },
  };
}
