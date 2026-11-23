import { describe, expect, it, vi } from "vitest";
import { createSearchStore } from "./search-store.ts";

describe("search store", () => {
  it("começa fechada, abre, fecha e alterna", () => {
    const store = createSearchStore();
    expect(store.isOpen()).toBe(false);

    store.open();
    expect(store.isOpen()).toBe(true);
    store.close();
    expect(store.isOpen()).toBe(false);
    store.toggle();
    expect(store.isOpen()).toBe(true);
    store.toggle();
    expect(store.isOpen()).toBe(false);
  });

  it("só avisa quem escuta quando o estado muda de verdade", () => {
    const store = createSearchStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.close(); // já fechada
    expect(listener).not.toHaveBeenCalled();
    store.open();
    store.open(); // já aberta
    expect(listener).toHaveBeenCalledTimes(1);
    store.close();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("quem cancela a inscrição deixa de ser avisado", () => {
    const store = createSearchStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.open();

    expect(listener).not.toHaveBeenCalled();
  });
});
