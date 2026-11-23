import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_NOTIFICATIONS } from "../domain/notification-plan.ts";
import { alarmStub, fakeClock, memoryGateway, platformStub } from "../test-support.ts";
import { createPomodoroStore } from "./pomodoro-store.ts";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 18, 12, 0, 0);

/** Um "app" completo (store com gateway, plataforma e alarme falsos). Dá para abrir outro sobre o mesmo banco. */
function openApp(
  gateway = memoryGateway(),
  clock = fakeClock(T0),
  platformOptions: Parameters<typeof platformStub>[0] = {},
) {
  const platform = platformStub(platformOptions);
  const alarm = alarmStub();
  const store = createPomodoroStore({ gateway, platform, alarm, clock });
  const advance = async (ms: number) => {
    clock.advance(ms);
    await vi.advanceTimersByTimeAsync(ms);
  };
  return { gateway, clock, platform, alarm, store, advance };
}

describe("pomodoro que sobrevive ao app fechado", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("guarda no banco ao iniciar, pausar, retomar e cancelar", async () => {
    const { store, gateway, advance } = openApp();
    await store.init();
    store.start("focus", "pagina-3");
    await advance(0);
    expect(gateway.timer.timer).toMatchObject({
      phase: "running",
      kind: "focus",
      startedAt: T0,
      endsAt: T0 + 25 * MIN,
      noteId: "pagina-3",
    });

    await advance(10 * MIN);
    store.pause();
    await advance(0);
    expect(gateway.timer.timer).toMatchObject({ phase: "paused", remainingMs: 15 * MIN });

    await advance(60 * MIN);
    store.resume();
    await advance(0);
    expect(gateway.timer.timer).toMatchObject({
      phase: "running",
      endsAt: T0 + 70 * MIN + 15 * MIN,
    });

    store.cancel();
    await advance(0);
    expect(gateway.timer.timer.phase).toBe("idle");
  });

  it("ao reabrir com o cronômetro ainda rodando, retoma com o tempo certo e termina na hora", async () => {
    const first = openApp();
    await first.store.init();
    first.store.start();
    await first.advance(0);
    first.store.dispose(); // o app foi fechado

    const clock = fakeClock(T0 + 10 * MIN);
    const second = openApp(first.gateway, clock);
    await second.store.init();
    const timer = second.store.getSnapshot().timer;
    expect(timer).toMatchObject({ phase: "running", startedAt: T0, endsAt: T0 + 25 * MIN });

    await second.advance(15 * MIN);
    expect(second.store.getSnapshot().finished).toEqual({ kind: "focus", recordFailed: false });
    expect(second.gateway.sessions).toHaveLength(1);
    expect(second.alarm.ring).toHaveBeenCalledTimes(1); // com a tela aberta e no horário: toca
  });

  it("reabrir com o cronômetro pausado mostra o restante e não termina sozinho", async () => {
    const first = openApp();
    await first.store.init();
    first.store.start();
    await first.advance(5 * MIN);
    first.store.pause();
    await first.advance(0);
    first.store.dispose();

    const second = openApp(first.gateway, fakeClock(T0 + 5 * 60 * MIN));
    await second.store.init();
    expect(second.store.getSnapshot().timer).toMatchObject({
      phase: "paused",
      remainingMs: 20 * MIN,
    });
    await second.advance(60 * MIN);
    expect(second.store.getSnapshot().timer.phase).toBe("paused");
    expect(second.gateway.sessions).toHaveLength(0);
  });

  it("se terminou com o app fechado, registra a sessão como concluída com o início real e sem som", async () => {
    const first = openApp();
    await first.store.init();
    first.store.start();
    await first.advance(0);
    first.store.dispose();

    // O app só é reaberto 3 horas depois do início (o término foi há 2 h 35 min).
    const clock = fakeClock(T0 + 3 * 60 * MIN);
    const second = openApp(first.gateway, clock, { systemAlarm: true });
    await second.store.init();

    const snap = second.store.getSnapshot();
    expect(snap.timer.phase).toBe("idle");
    expect(snap.finished).toEqual({ kind: "focus", recordFailed: false });
    expect(snap.completedInCycle).toBe(1);
    expect(second.gateway.sessions).toEqual([
      expect.objectContaining({ startedAt: T0, durationSec: 25 * 60 }),
    ]);
    expect(snap.sessions).toHaveLength(1);
    // Sem tempo inventado: a sessão vale os 25 minutos planejados, não as 3 horas.
    expect(second.gateway.timer).toEqual({ timer: { phase: "idle" }, cycle: 1 });
    expect(second.alarm.ring).not.toHaveBeenCalled();
    expect(second.platform.notify).not.toHaveBeenCalled();
    expect(second.platform.clearOngoing).toHaveBeenCalled();
  });

  it("reabrir de novo depois de concluído não registra a sessão outra vez", async () => {
    const first = openApp();
    await first.store.init();
    first.store.start();
    await first.advance(0);
    first.store.dispose();

    const late = fakeClock(T0 + 3 * 60 * MIN);
    const second = openApp(first.gateway, late);
    await second.store.init();
    second.store.dispose();
    const third = openApp(first.gateway, late);
    await third.store.init();

    expect(first.gateway.sessions).toHaveLength(1);
    expect(third.store.getSnapshot().finished).toBeNull();
    expect(third.store.getSnapshot().completedInCycle).toBe(1);
  });

  it("uma pausa que terminou com o app fechado não gera sessão e zera o ciclo da pausa longa", async () => {
    const first = openApp();
    await first.store.init();
    await first.store.saveSettings({ ...first.store.getSnapshot().settings, longBreakEvery: 2 });
    first.store.start("long-break");
    await first.advance(0);
    first.store.dispose();

    const second = openApp(first.gateway, fakeClock(T0 + 60 * MIN));
    await second.store.init();
    expect(second.store.getSnapshot().finished).toEqual({
      kind: "long-break",
      recordFailed: false,
    });
    expect(second.gateway.sessions).toHaveLength(0);
    expect(second.store.getSnapshot().completedInCycle).toBe(0);
  });

  it("o ciclo da pausa longa também volta ao reabrir o app com o cronômetro parado", async () => {
    const gateway = memoryGateway();
    await gateway.saveTimer({ timer: { phase: "idle" }, cycle: 3 });
    const { store } = openApp(gateway);
    await store.init();
    expect(store.getSnapshot().completedInCycle).toBe(3);
  });

  it("se a pessoa iniciar um cronômetro enquanto o banco ainda responde, o dela vale", async () => {
    const gateway = memoryGateway();
    await gateway.saveTimer({
      timer: {
        phase: "paused",
        kind: "break",
        startedAt: T0 - MIN,
        durationMs: 5 * MIN,
        remainingMs: MIN,
        noteId: null,
      },
      cycle: 0,
    });
    const { store } = openApp(gateway);
    const loading = store.init();
    store.start();
    await loading;
    expect(store.getSnapshot().timer).toMatchObject({ phase: "running", kind: "focus" });
  });

  it("falha ao ler o cronômetro guardado não atrapalha: começa parado", async () => {
    const gateway = memoryGateway();
    gateway.getTimer = async () => {
      throw new Error("banco indisponível");
    };
    const { store } = openApp(gateway);
    await store.init();
    expect(store.getSnapshot()).toMatchObject({ loaded: true, timer: { phase: "idle" } });
  });
});

describe("avisos do fim", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("computador: toca o sino (se ligado) e só notifica se a pessoa ligou", async () => {
    const quiet = openApp();
    await quiet.store.saveSettings({ ...quiet.store.getSnapshot().settings, sound: false });
    quiet.store.start();
    await quiet.advance(25 * MIN);
    expect(quiet.alarm.ring).not.toHaveBeenCalled();
    expect(quiet.platform.notify).not.toHaveBeenCalled();

    const loud = openApp();
    loud.store.start();
    await loud.advance(25 * MIN);
    expect(loud.alarm.ring).toHaveBeenCalledTimes(1);
    expect(loud.platform.notify).not.toHaveBeenCalled(); // notificação desligada por padrão

    const both = openApp();
    await both.store.saveSettings({ ...both.store.getSnapshot().settings, notify: true });
    both.store.start();
    await both.advance(25 * MIN);
    expect(both.alarm.ring).toHaveBeenCalledTimes(1);
    expect(both.platform.notify).toHaveBeenCalledWith(
      "Tramion · Foco",
      "Sessão de foco concluída. Hora de uma pausa.",
    );
  });

  it("celular (alarme do sistema): a tela não toca nem notifica de novo, para não dobrar o aviso", async () => {
    const { store, alarm, platform, advance } = openApp(memoryGateway(), fakeClock(T0), {
      systemAlarm: true,
    });
    await store.saveSettings({ ...store.getSnapshot().settings, notify: true });
    store.start();
    await advance(25 * MIN);
    expect(store.getSnapshot().finished).not.toBeNull();
    expect(alarm.ring).not.toHaveBeenCalled();
    expect(platform.notify).not.toHaveBeenCalled();
  });

  it("passou muito do horário (janela oculta): registra, mas não toca o sino fora de hora", async () => {
    const { store, clock, alarm, gateway } = openApp();
    store.start();
    clock.advance(2 * 60 * MIN); // temporizadores parados, relógio andou
    store.tick();
    await vi.advanceTimersByTimeAsync(0);
    expect(gateway.sessions).toHaveLength(1);
    expect(alarm.ring).not.toHaveBeenCalled();
  });

  it("iniciar libera o áudio (gesto da pessoa) e 'Ouvir' toca o sino de teste", () => {
    const { store, alarm } = openApp();
    store.start();
    expect(alarm.unlock).toHaveBeenCalledTimes(1);
    store.previewAlarm();
    expect(alarm.ring).toHaveBeenCalledTimes(1);
  });
});

describe("notificações do sistema acompanham o cronômetro", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const lastPlan = (platform: ReturnType<typeof platformStub>) =>
    platform.syncTimerNotifications.mock.calls.at(-1)?.[0];

  it("iniciar agenda o aviso do fim e mostra a notificação fixa", async () => {
    const { store, platform, advance } = openApp();
    store.start();
    await advance(0);
    const plan = lastPlan(platform);
    expect(plan.end).toMatchObject({ at: T0 + 25 * MIN, quiet: false });
    expect(plan.ongoing).toMatchObject({ countdownTo: T0 + 25 * MIN });
  });

  it("pausar cancela o aviso e muda a notificação; retomar reagenda com o restante", async () => {
    const { store, platform, advance } = openApp();
    store.start();
    await advance(10 * MIN);
    store.pause();
    await advance(0);
    let plan = lastPlan(platform);
    expect(plan.end).toBeNull();
    expect(plan.ongoing.title).toBe("Foco — pausado");

    await advance(30 * MIN);
    store.resume();
    await advance(0);
    plan = lastPlan(platform);
    expect(plan.end.at).toBe(T0 + 40 * MIN + 15 * MIN);
  });

  it("cancelar tira a notificação fixa e o alarme", async () => {
    const { store, platform, advance } = openApp();
    store.start();
    store.cancel();
    await advance(0);
    expect(lastPlan(platform)).toEqual(NO_NOTIFICATIONS);
  });

  it("ao terminar só tira a notificação fixa; o aviso do fim não é cancelado", async () => {
    const { store, platform, advance } = openApp();
    store.start();
    await advance(25 * MIN);
    expect(platform.clearOngoing).toHaveBeenCalledTimes(1);
    expect(lastPlan(platform).end).not.toBeNull(); // o último plano enviado foi o do início
  });

  it("desligar o som troca o alarme agendado para o canal silencioso", async () => {
    const { store, platform, advance } = openApp();
    store.start();
    await store.saveSettings({ ...store.getSnapshot().settings, sound: false });
    await advance(0);
    expect(lastPlan(platform).end.quiet).toBe(true);
  });

  it("ao abrir com o cronômetro parado, limpa o que sobrou no sistema", async () => {
    const { store, platform, advance } = openApp();
    await store.init();
    await advance(0);
    expect(lastPlan(platform)).toEqual(NO_NOTIFICATIONS);
  });

  it("ao reabrir com o cronômetro rodando, reagenda o alarme (por exemplo, depois de reiniciar o aparelho)", async () => {
    const first = openApp();
    first.store.start();
    await first.advance(0);
    first.store.dispose();
    const second = openApp(first.gateway, fakeClock(T0 + 5 * MIN));
    await second.store.init();
    expect(lastPlan(second.platform).end.at).toBe(T0 + 25 * MIN);
  });

  it("falha do sistema de notificações não atrapalha o cronômetro", async () => {
    const { store, platform, gateway, advance } = openApp();
    platform.syncTimerNotifications.mockRejectedValue(new Error("sem plugin"));
    platform.clearOngoing.mockRejectedValue(new Error("sem plugin"));
    store.start();
    await advance(25 * MIN);
    expect(gateway.sessions).toHaveLength(1);
  });
});
