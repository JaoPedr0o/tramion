import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDIT_DEBOUNCE_MS, MIN_GAP_MS, PERIOD_MS, startAutoSync } from "./auto-sync.ts";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

/** Uma sincronização que só termina quando o teste manda. */
function manual() {
  const finishers: Array<() => void> = [];
  const run = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishers.push(resolve);
      }),
  );
  return {
    run,
    finish: async () => {
      finishers.shift()?.();
      await vi.advanceTimersByTimeAsync(0);
    },
  };
}

describe("startAutoSync", () => {
  it("o primeiro pedido sincroniza na hora", () => {
    const run = vi.fn(async () => {});
    const sync = startAutoSync(run);

    sync.trigger();

    expect(run).toHaveBeenCalledTimes(1);
    sync.stop();
  });

  it("pedidos seguidos dentro do intervalo mínimo viram uma sincronização só, depois da espera", async () => {
    const run = vi.fn(async () => {});
    const sync = startAutoSync(run);
    sync.trigger();
    await vi.advanceTimersByTimeAsync(1_000);

    sync.trigger();
    sync.trigger();
    sync.trigger();
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MIN_GAP_MS);

    expect(run).toHaveBeenCalledTimes(2);
    sync.stop();
  });

  it("nunca roda duas ao mesmo tempo: o pedido que chega durante uma vira outra logo depois", async () => {
    const m = manual();
    const sync = startAutoSync(m.run, { minGapMs: 0 });
    sync.trigger();
    sync.trigger();
    expect(m.run).toHaveBeenCalledTimes(1);

    await m.finish();

    expect(m.run).toHaveBeenCalledTimes(2);
    sync.stop();
  });

  it("uma falha não derruba o agendador: o próximo pedido sincroniza de novo", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("sem rede")).mockResolvedValue(undefined);
    const sync = startAutoSync(run, { minGapMs: 0 });

    sync.trigger();
    await vi.advanceTimersByTimeAsync(0);
    sync.trigger();

    expect(run).toHaveBeenCalledTimes(2);
    sync.stop();
  });

  it("sincroniza sozinho no ritmo do período enquanto está ativo", async () => {
    const run = vi.fn(async () => {});
    const sync = startAutoSync(run);

    await vi.advanceTimersByTimeAsync(PERIOD_MS * 3 + 100);

    expect(run.mock.calls.length).toBe(3);
    sync.stop();
  });

  it("depois de editar, espera uma pausa; cada nova edição reinicia a espera", async () => {
    const run = vi.fn(async () => {});
    const sync = startAutoSync(run, { minGapMs: 0 });

    sync.triggerSoon();
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS - 1_000);
    sync.triggerSoon();
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS - 1_000);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_500);

    expect(run).toHaveBeenCalledTimes(1);
    sync.stop();
  });

  it("depois de parar, nada mais é sincronizado (nem o que estava agendado)", async () => {
    const run = vi.fn(async () => {});
    const sync = startAutoSync(run);
    sync.trigger();
    await vi.advanceTimersByTimeAsync(500);
    sync.trigger(); // agendada para daqui a MIN_GAP
    sync.triggerSoon();

    sync.stop();
    await vi.advanceTimersByTimeAsync(PERIOD_MS * 2);
    sync.trigger();

    expect(run).toHaveBeenCalledTimes(1);
  });
});
