import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./habit.ts";
import { NO_NOTIFICATIONS, planNotifications } from "./notification-plan.ts";
import { IDLE, pauseTimer, resumeTimer, startTimer } from "./pomodoro.ts";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 18, 22, 0, 0); // 22:00 UTC = 19:00 em São Paulo
const ZONE = "America/Sao_Paulo";

describe("plano de notificações do cronômetro", () => {
  it("parado: nada a mostrar nem agendar", () => {
    expect(planNotifications(IDLE, DEFAULT_SETTINGS, T0, ZONE)).toEqual(NO_NOTIFICATIONS);
  });

  it("rodando: notificação fixa com a hora de término e aviso agendado para essa hora", () => {
    const timer = startTimer("focus", T0, 25 * MIN);
    const plan = planNotifications(timer, DEFAULT_SETTINGS, T0, ZONE);

    expect(plan.ongoing).toEqual({
      title: "Foco em andamento — termina às 19:25",
      body: "Toque para abrir o Tramion.",
      countdownTo: T0 + 25 * MIN,
    });
    expect(plan.end).toEqual({
      at: T0 + 25 * MIN,
      title: "Tramion · Foco",
      body: "Sessão de foco concluída. Hora de uma pausa.",
      quiet: false,
    });
  });

  it("a pausa usa o texto de pausa e avisa que é hora de focar", () => {
    const plan = planNotifications(startTimer("break", T0, 5 * MIN), DEFAULT_SETTINGS, T0, ZONE);
    expect(plan.ongoing?.title).toBe("Pausa em andamento — termina às 19:05");
    expect(plan.end?.body).toBe("Pausa terminou. Pronto para focar?");

    const long = planNotifications(
      startTimer("long-break", T0, 15 * MIN),
      DEFAULT_SETTINGS,
      T0,
      ZONE,
    );
    expect(long.end?.body).toBe("Pausa longa terminou. Pronto para focar?");
  });

  it("o aviso fica silencioso quando 'Som ao terminar' está desligado", () => {
    const timer = startTimer("focus", T0, 25 * MIN);
    const plan = planNotifications(timer, { sound: false }, T0, ZONE);
    expect(plan.end?.quiet).toBe(true);
  });

  it("pausado: notificação 'pausado' sem contagem e SEM aviso agendado (cancela o alarme)", () => {
    const paused = pauseTimer(startTimer("focus", T0, 25 * MIN), T0 + 10 * MIN);
    const plan = planNotifications(paused, DEFAULT_SETTINGS, T0 + 20 * MIN, ZONE);

    expect(plan.end).toBeNull();
    expect(plan.ongoing).toEqual({
      title: "Foco — pausado",
      body: "Restam 15:00. Toque para abrir o Tramion.",
      countdownTo: null,
    });
  });

  it("retomar reagenda com o restante: o término é recalculado a partir do agora", () => {
    const paused = pauseTimer(startTimer("focus", T0, 25 * MIN), T0 + 10 * MIN);
    const resumedAt = T0 + 60 * MIN;
    const resumed = resumeTimer(paused, resumedAt);
    const plan = planNotifications(resumed, DEFAULT_SETTINGS, resumedAt, ZONE);
    expect(plan.end?.at).toBe(resumedAt + 15 * MIN);
    expect(plan.ongoing?.title).toBe("Foco em andamento — termina às 20:15");
  });

  it("término que já passou não agenda nada (o fim está sendo tratado)", () => {
    const timer = startTimer("focus", T0, 25 * MIN);
    expect(planNotifications(timer, DEFAULT_SETTINGS, T0 + 25 * MIN, ZONE)).toEqual(
      NO_NOTIFICATIONS,
    );
  });
});
