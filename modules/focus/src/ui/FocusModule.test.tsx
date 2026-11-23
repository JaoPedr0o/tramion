// @vitest-environment jsdom
import { createEventBus, createModuleRegistry, createViewRegistry } from "@tramion/core";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFocusModule } from "../module.ts";
import { memoryGateway, platformStub } from "../test-support.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// O Testing Library só sabe esperar com temporizadores falsos quando enxerga um objeto `jest`: este atalho o
// ensina a avançar os temporizadores falsos do Vitest.
(globalThis as { jest?: unknown }).jest = {
  advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
};

const T0 = Date.UTC(2026, 10, 18, 12, 0, 0); // quarta-feira, 18/11/2026 (UTC)
const MIN = 60_000;

function mount(gateway = memoryGateway({ now: () => Date.now() })) {
  const platform = platformStub();
  const views = createViewRegistry();
  const registry = createModuleRegistry({ events: createEventBus(), views });
  // O relógio do módulo é o do Date, que os temporizadores falsos controlam.
  registry.add(
    createFocusModule(gateway, { platform, clock: { now: () => Date.now(), timeZone: "UTC" } }),
  );
  registry.start();
  const view = views.list().find((v) => v.id === "focus")!;
  const Main = view.main;
  const Topbar = view.topbar!;
  const screen_ = render(
    <>
      <Topbar />
      <Main />
    </>,
  );
  return { gateway, platform, view, Main, ...screen_ };
}

/** Deixa as promessas pendentes (gateway em memória) terminarem. */
const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const user = () => userEvent.setup({ delay: null });

describe("tela Foco", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("abre calma: pomodoro parado, nenhum aviso, nenhuma janela, nenhuma pergunta", async () => {
    const { platform } = mount();
    await settle();

    expect(screen.getByRole("timer").textContent).toBe("25:00");
    expect(screen.getByRole("button", { name: "Iniciar foco" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Nenhuma sessão hoje.")).toBeTruthy();
    expect(platform.notify).not.toHaveBeenCalled();
  });

  describe("pomodoro", () => {
    it("inicia, mostra o tempo pelo relógio e registra a sessão ao fim", async () => {
      const { gateway } = mount();
      await settle();
      await user().click(screen.getByRole("button", { name: "Iniciar foco" }));

      await advance(10 * MIN);
      expect(screen.getByRole("timer").textContent).toBe("15:00");
      expect(screen.getByRole("button", { name: "Pausar" })).toBeTruthy();

      await advance(15 * MIN);
      const status = screen.getByRole("status");
      expect(within(status).getByText("Sessão de foco concluída.")).toBeTruthy();
      expect(gateway.sessions).toHaveLength(1);
      expect(gateway.sessions[0]).toMatchObject({ startedAt: T0, durationSec: 1500 });
      expect(screen.getByText("Hoje: 1 sessão · 25 min")).toBeTruthy();
    });

    it("pausa, retoma e cancela sem registrar", async () => {
      const { gateway } = mount();
      await settle();
      const u = user();
      await u.click(screen.getByRole("button", { name: "Iniciar foco" }));
      await advance(5 * MIN);
      await u.click(screen.getByRole("button", { name: "Pausar" }));
      await advance(60 * MIN);
      expect(screen.getByRole("timer").textContent).toBe("20:00");
      expect(screen.getByText("Foco (pausado)")).toBeTruthy();

      await u.click(screen.getByRole("button", { name: "Retomar" }));
      await advance(MIN);
      expect(screen.getByRole("timer").textContent).toBe("19:00");

      await u.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(screen.getByRole("button", { name: "Iniciar foco" })).toBeTruthy();
      await advance(60 * MIN);
      expect(gateway.sessions).toHaveLength(0);
    });

    it("o cronômetro sobrevive a sair da tela e voltar", async () => {
      const first = mount();
      await settle();
      await user().click(screen.getByRole("button", { name: "Iniciar foco" }));
      await advance(7 * MIN);

      // Troca de tela: a interface é desmontada, o módulo continua.
      first.unmount();
      await advance(3 * MIN);
      const { container } = render(<first.Main />);
      await settle();

      expect(within(container).getByRole("timer").textContent).toBe("15:00");

      // E termina mesmo sem tela montada.
      cleanup();
      await advance(15 * MIN);
      expect(first.gateway.sessions).toHaveLength(1);
    });

    it("depois do foco oferece a pausa; 'Agora não' dispensa sem iniciar nada", async () => {
      mount();
      await settle();
      const u = user();
      await u.click(screen.getByRole("button", { name: "Iniciar foco" }));
      await advance(25 * MIN);

      await u.click(screen.getByRole("button", { name: "Começar pausa (5 min)" }));
      expect(screen.getByText("Pausa")).toBeTruthy();
      expect(screen.getByRole("timer").textContent).toBe("05:00");
      await advance(5 * MIN);
      expect(screen.getByRole("button", { name: "Começar foco" })).toBeTruthy();

      await u.click(screen.getByRole("button", { name: "Agora não" }));
      expect(screen.queryByRole("button", { name: "Começar foco" })).toBeNull();
      expect(screen.getByRole("button", { name: "Iniciar foco" })).toBeTruthy();
    });

    it("ajustes: salva durações e a notificação, que só avisa se ligada", async () => {
      const { gateway, platform } = mount();
      await settle();
      const u = user();
      await u.click(screen.getByText("Ajustes do pomodoro"));
      const focusField = screen.getByLabelText("Foco (minutos)");
      await u.clear(focusField);
      await u.type(focusField, "50");
      await u.click(
        screen.getByRole("checkbox", { name: "Avisar no fim com uma notificação do sistema" }),
      );
      await u.click(screen.getByRole("button", { name: "Salvar ajustes" }));
      await settle();

      expect(gateway.settings).toMatchObject({ focusMin: 50, notify: true });
      expect(screen.getByText("Ajustes salvos.")).toBeTruthy();
      expect(screen.getByRole("timer").textContent).toBe("50:00");

      await u.click(screen.getByRole("button", { name: "Iniciar foco" }));
      await advance(50 * MIN);
      expect(platform.notify).toHaveBeenCalledTimes(1);
    });
  });

  describe("hábitos", () => {
    async function openHabits() {
      const m = mount();
      await settle();
      await user().click(screen.getByRole("tab", { name: "Hábitos" }));
      await settle();
      return m;
    }

    it("sem hábitos mostra um texto calmo, sem empurrar nada", async () => {
      await openHabits();
      expect(screen.getByText("Nenhum hábito ainda. Crie um quando quiser.")).toBeTruthy();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("cria um hábito, marca hoje com um toque e mostra a sequência", async () => {
      const { gateway } = await openHabits();
      const u = user();
      await u.click(screen.getByRole("button", { name: "Novo hábito" }));
      const dialog = screen.getByRole("dialog", { name: "Novo hábito" });
      await u.type(within(dialog).getByLabelText("Nome"), "Ler 20 minutos");
      await u.click(within(dialog).getByRole("button", { name: "Salvar" }));
      await settle();

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByText("Ler 20 minutos")).toBeTruthy();
      expect(screen.getByText(/Todo dia · sem sequência/)).toBeTruthy();

      await u.click(screen.getByRole("button", { name: "Ler 20 minutos: marcar hoje" }));
      await settle();
      const mark = screen.getByRole("button", { name: "Ler 20 minutos: feito hoje (desmarcar)" });
      expect(mark.getAttribute("aria-pressed")).toBe("true");
      expect(gateway.checks).toEqual([{ habitId: expect.any(String), day: "2026-11-18" }]);
      expect(screen.getByText(/sequência de 1 dia/)).toBeTruthy();

      // Corrigir o dia anterior pela tira dos últimos 7 dias.
      await u.click(screen.getByRole("button", { name: "Ler 20 minutos, 17 de novembro" }));
      await settle();
      expect(screen.getByText(/sequência de 2 dias/)).toBeTruthy();

      await u.click(mark);
      await settle();
      expect(screen.getByText(/sequência de 1 dia/)).toBeTruthy();
    });

    it("mostra o mapa de calor quando há hábitos", async () => {
      await openHabits();
      expect(screen.queryByRole("img", { name: /Mapa de calor/ })).toBeNull();
      const u = user();
      await u.click(screen.getByRole("button", { name: "Novo hábito" }));
      await u.type(screen.getByLabelText("Nome"), "Água");
      await u.click(screen.getByRole("button", { name: "Salvar" }));
      await settle();
      expect(
        screen.getByRole("img", {
          name: "Mapa de calor dos últimos seis meses: nenhum dia com hábitos marcados.",
        }),
      ).toBeTruthy();
      await u.click(screen.getByRole("button", { name: "Água: marcar hoje" }));
      await settle();
      expect(
        screen.getByRole("img", {
          name: "Mapa de calor dos últimos seis meses: 1 dia com hábitos marcados.",
        }),
      ).toBeTruthy();
    });

    it("frequência semanal pede o número de vezes e mostra o progresso da semana", async () => {
      await openHabits();
      const u = user();
      await u.click(screen.getByRole("button", { name: "Novo hábito" }));
      await u.type(screen.getByLabelText("Nome"), "Correr");
      await u.click(screen.getByRole("radio", { name: "Algumas vezes por semana" }));
      await u.selectOptions(screen.getByLabelText("Vezes por semana"), "2");
      await u.click(screen.getByRole("button", { name: "Salvar" }));
      await settle();

      await u.click(screen.getByRole("button", { name: "Correr: marcar hoje" }));
      await settle();
      expect(screen.getByText(/2 vezes por semana/)).toBeTruthy();
      expect(screen.getByText(/1\/2 nesta semana/)).toBeTruthy();
    });

    it("mensagem em português quando o nome é inválido, e o diálogo continua aberto", async () => {
      await openHabits();
      const u = user();
      await u.click(screen.getByRole("button", { name: "Novo hábito" }));
      await u.click(screen.getByRole("button", { name: "Salvar" }));
      await settle();
      expect(screen.getByRole("alert").textContent).toBe(
        "Dê um nome ao hábito (até 100 caracteres).",
      );
      expect(screen.getByRole("dialog")).toBeTruthy();
    });

    it("Esc fecha o diálogo, o foco volta ao botão e o Tab não escapa da janela", async () => {
      await openHabits();
      const u = user();
      const open = screen.getByRole("button", { name: "Novo hábito" });
      await u.click(open);
      const dialog = screen.getByRole("dialog");
      expect(document.activeElement).toBe(within(dialog).getByLabelText("Nome"));

      await u.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
      await u.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(open);
    });

    it("edita e arquiva; arquivado some da lista, volta em 'Mostrar arquivados' e pode ser desarquivado", async () => {
      const gateway = memoryGateway({ now: () => Date.now() });
      await gateway.createHabit({
        name: "Meditar",
        icon: null,
        frequency: "daily",
        timesPerWeek: null,
      });
      mount(gateway);
      await settle();
      const u = user();
      await u.click(screen.getByRole("tab", { name: "Hábitos" }));
      await settle();

      await u.click(screen.getByRole("button", { name: "Editar" }));
      const name = screen.getByLabelText("Nome");
      await u.clear(name);
      await u.type(name, "Meditar 10 min");
      await u.click(screen.getByRole("button", { name: "Salvar" }));
      await settle();
      expect(screen.getByText("Meditar 10 min")).toBeTruthy();

      await u.click(screen.getByRole("button", { name: "Arquivar" }));
      await settle();
      expect(screen.queryByText("Meditar 10 min")).toBeNull();

      await u.click(screen.getByRole("checkbox", { name: "Mostrar arquivados" }));
      await settle();
      expect(screen.getByText(/Meditar 10 min \(arquivado\)/)).toBeTruthy();
      expect(
        screen
          .getByRole("button", { name: "Meditar 10 min: marcar hoje" })
          .hasAttribute("disabled"),
      ).toBe(true);

      await u.click(screen.getByRole("button", { name: "Desarquivar" }));
      await settle();
      expect(screen.queryByText(/\(arquivado\)/)).toBeNull();
    });

    it("na virada do dia o 'hoje' muda sozinho e a marca de ontem passa a ser passado", async () => {
      const gateway = memoryGateway({ now: () => Date.now() });
      const habit = await gateway.createHabit({
        name: "Água",
        icon: null,
        frequency: "daily",
        timesPerWeek: null,
      });
      await gateway.setCheck({ habitId: habit.id, day: "2026-11-18", done: true });
      mount(gateway);
      await settle();
      await user().click(screen.getByRole("tab", { name: "Hábitos" }));
      await settle();
      expect(screen.getByRole("button", { name: "Água: feito hoje (desmarcar)" })).toBeTruthy();

      // Meia-noite (UTC) passa com a tela aberta.
      await advance(12 * 60 * MIN + 31_000);
      expect(screen.getByRole("button", { name: "Água: marcar hoje" })).toBeTruthy();
      // A sequência de ontem continua valendo (hoje ainda está aberto).
      expect(screen.getByText(/sequência de 1 dia/)).toBeTruthy();
    });
  });

  it("as abas funcionam pelo teclado e a escolha é lembrada ao voltar para a tela", async () => {
    const { Main, unmount } = mount();
    await settle();
    const u = user();
    screen.getByRole("tab", { name: "Pomodoro" }).focus();
    await u.keyboard("{ArrowRight}");
    await settle();
    expect(screen.getByRole("tab", { name: "Hábitos" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel")).toBeTruthy();

    unmount();
    render(<Main />);
    await settle();
    expect(screen.getByRole("tab", { name: "Hábitos" }).getAttribute("aria-selected")).toBe("true");
  });
});
