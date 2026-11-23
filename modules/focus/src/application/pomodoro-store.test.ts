import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FocusError } from "../domain/errors.ts";
import { alarmStub, fakeClock, memoryGateway, platformStub } from "../test-support.ts";
import { createPomodoroStore } from "./pomodoro-store.ts";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 18, 12, 0, 0);

/** O relógio falso e os temporizadores falsos andam juntos. */
function setup(
  gatewayOptions: Parameters<typeof memoryGateway>[0] = {},
  platformOptions: Parameters<typeof platformStub>[0] = {},
) {
  const clock = fakeClock(T0);
  const gateway = memoryGateway({ now: clock.now, ...gatewayOptions });
  const platform = platformStub(platformOptions);
  const alarm = alarmStub();
  const store = createPomodoroStore({ gateway, platform, alarm, clock });
  const advance = async (ms: number) => {
    clock.advance(ms);
    await vi.advanceTimersByTimeAsync(ms);
  };
  return { clock, gateway, platform, alarm, store, advance };
}

describe("store do pomodoro", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("não faz nada sozinho: começa parado, sem aviso e sem sessão", async () => {
    const { store, platform, gateway } = setup();
    await store.init();
    expect(store.getSnapshot().timer.phase).toBe("idle");
    expect(store.getSnapshot().finished).toBeNull();
    expect(platform.notify).not.toHaveBeenCalled();
    expect(gateway.sessions).toEqual([]);
  });

  it("carrega os ajustes salvos", async () => {
    const { store, gateway } = setup();
    await gateway.saveSettings({ ...gateway.settings, focusMin: 40 });
    await store.init();
    expect(store.getSnapshot().settings.focusMin).toBe(40);
  });

  it("uma sessão de foco completa é registrada com início e duração", async () => {
    const { store, gateway, advance } = setup();
    await store.init();
    store.start("focus", "pagina-7");
    expect(store.getSnapshot().timer).toMatchObject({ phase: "running", endsAt: T0 + 25 * MIN });

    await advance(25 * MIN);

    expect(store.getSnapshot().timer.phase).toBe("idle");
    expect(store.getSnapshot().finished).toEqual({ kind: "focus", recordFailed: false });
    expect(gateway.sessions).toHaveLength(1);
    expect(gateway.sessions[0]).toMatchObject({
      startedAt: T0,
      durationSec: 25 * 60,
      noteId: "pagina-7",
    });
    expect(store.getSnapshot().sessions).toHaveLength(1);
    expect(store.getSnapshot().completedInCycle).toBe(1);
  });

  it("não termina antes da hora", async () => {
    const { store, gateway, advance } = setup();
    store.start();
    await advance(25 * MIN - 1);
    expect(store.getSnapshot().timer.phase).toBe("running");
    await advance(1);
    expect(store.getSnapshot().timer.phase).toBe("idle");
    expect(gateway.sessions).toHaveLength(1);
  });

  it("o tempo vem do relógio: se o temporizador atrasar (janela oculta), o `tick` conclui na hora certa", async () => {
    const { store, clock, gateway } = setup();
    store.start();
    // Os temporizadores ficam parados (janela oculta), mas o relógio andou 40 minutos.
    clock.advance(40 * MIN);
    store.tick();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().timer.phase).toBe("idle");
    expect(gateway.sessions[0]).toMatchObject({ startedAt: T0, durationSec: 25 * 60 });
    store.tick(); // chamar de novo não registra duas vezes
    await vi.advanceTimersByTimeAsync(0);
    expect(gateway.sessions).toHaveLength(1);
  });

  it("pausar congela e retomar continua de onde parou; o registro usa o início real", async () => {
    const { store, gateway, advance } = setup();
    store.start();
    await advance(10 * MIN);
    store.pause();
    await advance(3 * 60 * MIN); // pausado por horas: nada acontece
    expect(store.getSnapshot().timer).toMatchObject({ phase: "paused", remainingMs: 15 * MIN });
    expect(gateway.sessions).toHaveLength(0);

    store.resume();
    await advance(15 * MIN - 1);
    expect(store.getSnapshot().timer.phase).toBe("running");
    await advance(1);
    expect(store.getSnapshot().timer.phase).toBe("idle");
    expect(gateway.sessions[0]).toMatchObject({ startedAt: T0, durationSec: 25 * 60 });
  });

  it("cancelar não registra nada nem avisa", async () => {
    const { store, gateway, platform, advance } = setup();
    await store.saveSettings({ ...store.getSnapshot().settings, notify: true });
    store.start();
    await advance(5 * MIN);
    store.cancel();
    await advance(60 * MIN);
    expect(store.getSnapshot()).toMatchObject({ timer: { phase: "idle" }, finished: null });
    expect(gateway.sessions).toHaveLength(0);
    expect(platform.notify).not.toHaveBeenCalled();
  });

  it("só avisa pelo sistema se a pessoa ligou; o aviso na tela (finished) existe sempre", async () => {
    const off = setup();
    off.store.start();
    await off.advance(25 * MIN);
    expect(off.platform.notify).not.toHaveBeenCalled();
    expect(off.store.getSnapshot().finished).not.toBeNull();

    const on = setup();
    await on.store.saveSettings({ ...on.store.getSnapshot().settings, notify: true });
    on.store.start();
    await on.advance(25 * MIN);
    expect(on.platform.notify).toHaveBeenCalledTimes(1);
  });

  it("a notificação que falha não atrapalha", async () => {
    const { store, platform, gateway, advance } = setup();
    platform.notify.mockRejectedValue(new Error("sem permissão"));
    await store.saveSettings({ ...store.getSnapshot().settings, notify: true });
    store.start();
    await advance(25 * MIN);
    expect(gateway.sessions).toHaveLength(1);
  });

  it("depois do foco sugere a pausa; depois da pausa, o foco; pausa não gera sessão", async () => {
    const { store, gateway, advance } = setup();
    store.start();
    await advance(25 * MIN);
    store.startNext();
    expect(store.getSnapshot().timer).toMatchObject({ phase: "running", kind: "break" });
    expect(store.getSnapshot().finished).toBeNull();
    await advance(5 * MIN);
    expect(store.getSnapshot().finished).toMatchObject({ kind: "break" });
    expect(gateway.sessions).toHaveLength(1);
    store.startNext();
    expect(store.getSnapshot().timer).toMatchObject({ phase: "running", kind: "focus" });
  });

  it("pausa longa a cada N sessões, depois zera o ciclo", async () => {
    const { store, advance } = setup();
    await store.saveSettings({ ...store.getSnapshot().settings, longBreakEvery: 2 });
    store.start();
    await advance(25 * MIN);
    store.startNext(); // pausa curta (1ª sessão)
    expect(store.getSnapshot().timer).toMatchObject({ kind: "break" });
    await advance(5 * MIN);
    store.startNext(); // foco
    await advance(25 * MIN);
    store.startNext(); // 2ª sessão: pausa longa
    expect(store.getSnapshot().timer).toMatchObject({ kind: "long-break", durationMs: 15 * MIN });
    await advance(15 * MIN);
    expect(store.getSnapshot().completedInCycle).toBe(0);
  });

  it("pode dispensar o aviso de conclusão sem iniciar nada", async () => {
    const { store, advance } = setup();
    store.start();
    await advance(25 * MIN);
    store.dismissFinished();
    expect(store.getSnapshot()).toMatchObject({ finished: null, timer: { phase: "idle" } });
  });

  it("não inicia por cima de um cronômetro que já roda", async () => {
    const { store, advance } = setup();
    store.start("focus", "a");
    await advance(MIN);
    store.start("focus", "b");
    expect(store.getSnapshot().timer).toMatchObject({ startedAt: T0, noteId: "a" });
  });

  it("se gravar a sessão falhar, avisa e deixa tentar de novo sem perdê-la", async () => {
    let failing = true;
    const { store, gateway, advance } = setup({
      failWith: () => (failing ? new FocusError("focus.internal", "disco cheio") : null),
    });
    store.start();
    await advance(25 * MIN);
    expect(store.getSnapshot().finished).toEqual({ kind: "focus", recordFailed: true });
    expect(gateway.sessions).toHaveLength(0);

    failing = false;
    await store.retryRecord();
    expect(gateway.sessions).toHaveLength(1);
    expect(store.getSnapshot().finished).toEqual({ kind: "focus", recordFailed: false });
    await store.retryRecord();
    expect(gateway.sessions).toHaveLength(1);
  });

  it("ajustes inválidos devolvem erro sem mudar o que valia", async () => {
    const { store, gateway } = setup();
    gateway.saveSettings = async () => {
      throw new FocusError("focus.settings-invalid", "fora dos limites");
    };
    const ok = await store.saveSettings({ ...store.getSnapshot().settings, focusMin: 0 });
    expect(ok).toBe(false);
    expect(store.getSnapshot().error?.code).toBe("focus.settings-invalid");
    expect(store.getSnapshot().settings.focusMin).toBe(25);
  });

  it("sobrevive a quem se inscreve e se desinscreve (trocar de tela) sem perder o estado", async () => {
    const { store, advance } = setup();
    store.start();
    const seen: string[] = [];
    const unsubscribe = store.subscribe(() => seen.push(store.getSnapshot().timer.phase));
    unsubscribe(); // a tela foi desmontada
    await advance(25 * MIN);
    expect(seen).toEqual([]);
    expect(store.getSnapshot().finished).not.toBeNull(); // o fim aconteceu mesmo sem tela
  });

  it("falha ao carregar ajustes não impede o uso (cai no padrão)", async () => {
    const { store } = setup({ failWith: () => new FocusError("focus.internal", "x") });
    await store.init();
    expect(store.getSnapshot().loaded).toBe(true);
    expect(store.getSnapshot().settings.focusMin).toBe(25);
    store.start();
    expect(store.getSnapshot().timer.phase).toBe("running");
  });

  it("calcula o dia de hoje pelo fuso do relógio", () => {
    const clock = fakeClock(Date.UTC(2026, 10, 18, 2, 30), "America/Sao_Paulo");
    const store = createPomodoroStore({
      gateway: memoryGateway(),
      platform: platformStub(),
      alarm: alarmStub(),
      clock,
    });
    expect(store.today()).toBe("2026-11-17");
  });
});
