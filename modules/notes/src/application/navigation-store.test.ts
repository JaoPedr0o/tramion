import { describe, expect, it, vi } from "vitest";
import { createNavigationStore } from "./navigation-store.ts";

describe("estado de navegação", () => {
  it("começa nas páginas, sem nada aberto", () => {
    const state = createNavigationStore().getState();

    expect(state).toMatchObject({ mode: "pages", selectedId: null, actionError: null });
    expect(state.expanded.size).toBe(0);
  });

  it("abrir uma página a seleciona, deixa abertos os ancestrais e limpa o erro", () => {
    const store = createNavigationStore();
    store.fail("deu ruim");

    store.open("c", ["a", "b"]);

    const state = store.getState();
    expect(state.selectedId).toBe("c");
    expect([...state.expanded].sort()).toEqual(["a", "b"]);
    expect(state.actionError).toBeNull();
  });

  it("abrir uma página sai da lixeira", () => {
    const store = createNavigationStore();
    store.showTrash();

    store.open("a");

    expect(store.getState().mode).toBe("pages");
  });

  it("mostrar a lixeira desmarca a página aberta", () => {
    const store = createNavigationStore();
    store.open("a");

    store.showTrash();

    expect(store.getState()).toMatchObject({ mode: "trash", selectedId: null });
  });

  it("expandir e recolher alternam, e abrir novas páginas não fecha as já abertas", () => {
    const store = createNavigationStore();
    store.toggle("a");
    expect(store.getState().expanded.has("a")).toBe(true);

    store.reveal(["b"]);
    expect([...store.getState().expanded].sort()).toEqual(["a", "b"]);

    store.toggle("a");
    expect([...store.getState().expanded]).toEqual(["b"]);
  });

  it("o estado é imutável: o objeto só muda quando algo muda", () => {
    const store = createNavigationStore();
    const before = store.getState();
    const expandedBefore = before.expanded;

    store.toggle("a");

    expect(store.getState()).not.toBe(before);
    expect(before.expanded).toBe(expandedBefore);
    expect(before.expanded.size).toBe(0); // o conjunto antigo não foi alterado
  });

  it("avisa os assinantes a cada mudança e para de avisar depois de cancelar", () => {
    const store = createNavigationStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.open("a");
    store.fail("x");
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.close();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("limpar o erro só avisa se havia erro", () => {
    const store = createNavigationStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.clearError();
    expect(listener).not.toHaveBeenCalled();

    store.fail("x");
    store.clearError();
    expect(store.getState().actionError).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("salvar o que está pendente chama o editor aberto; sem editor, não faz nada", async () => {
    const store = createNavigationStore();
    await expect(store.flush()).resolves.toBeUndefined(); // sem editor registrado

    const flush = vi.fn(async () => {});
    const unregister = store.registerFlush(flush);
    await store.flush();
    expect(flush).toHaveBeenCalledOnce();

    unregister();
    await store.flush();
    expect(flush).toHaveBeenCalledOnce(); // desregistrado
  });

  it("um editor antigo não desregistra o novo (a troca de páginas acontece em qualquer ordem)", async () => {
    const store = createNavigationStore();
    const oldFlush = vi.fn(async () => {});
    const newFlush = vi.fn(async () => {});
    const unregisterOld = store.registerFlush(oldFlush);
    store.registerFlush(newFlush); // o editor novo monta antes de o antigo desmontar

    unregisterOld();
    await store.flush();

    expect(newFlush).toHaveBeenCalledOnce();
  });
});
