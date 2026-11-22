// @vitest-environment jsdom
import type { AppEvents } from "@aun/contracts";
import { createEventBus } from "@aun/core";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNotesService } from "../application/notes-service.ts";
import { createFakeGateway } from "../test-support.ts";
import { createNotesView } from "./NotesView.tsx";

// Diz ao React que estamos num ambiente de teste (evita avisos sobre `act`).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setup() {
  const fake = createFakeGateway();
  const events = createEventBus<AppEvents>();
  const service = createNotesService({ gateway: fake.gateway, events });
  const View = createNotesView({ service, events });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
  render(<View />);
  return { fake, events, user };
}

/** Deixa passar a pausa do salvamento automático (500 ms) e as promessas pendentes. */
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });

const statusText = () => screen.getByRole("status", { name: "" }).textContent ?? "";

describe("tela de notas", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  async function createFirstNote(user: ReturnType<typeof setup>["user"]) {
    await user.click(await screen.findByRole("button", { name: "Nova nota" }));
    return screen.findByLabelText("Título");
  }

  it("mostra o estado vazio e cria a primeira nota pelo botão", async () => {
    const { user } = setup();
    expect(await screen.findByText(/Nenhuma nota ainda/)).toBeTruthy();

    const title = await createFirstNote(user);

    expect((title as HTMLInputElement).value).toBe("Sem título");
    const list = await screen.findByRole("list", { name: "Notas" });
    expect(within(list).getByText("Sem título")).toBeTruthy();
  });

  it("salva sozinha depois da pausa e mostra 'Salvo'", async () => {
    const { user, fake } = setup();
    const title = await createFirstNote(user);

    await user.clear(title);
    await user.type(title, "Compras");
    expect(statusText()).toContain("não salvas");
    await settle();

    expect(fake.notes.get("n1")?.title).toBe("Compras");
    expect(statusText()).toContain("Salvo");
  });

  it("título vazio não é salvo: mostra o motivo e mantém o texto na tela", async () => {
    const { user, fake } = setup();
    const title = await createFirstNote(user);

    await user.clear(title);
    await settle();

    expect(statusText()).toContain("O título não pode ficar vazio");
    expect(fake.notes.get("n1")?.title).toBe("Sem título");
  });

  it("conflito: mantém o texto digitado, avisa, e 'manter o meu texto' salva por cima", async () => {
    const { user, fake } = setup();
    await createFirstNote(user);
    fake.touch("n1", { body: "texto vindo de outra janela" });

    const body = screen.getByLabelText("Texto da nota") as HTMLTextAreaElement;
    await user.type(body, "meu texto");
    await settle();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("alterada em outro lugar");
    expect(body.value).toBe("meu texto"); // nada foi perdido

    await user.click(within(alert).getByRole("button", { name: "Manter o meu texto" }));
    await settle();

    expect(fake.notes.get("n1")?.body).toBe("meu texto");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(statusText()).toContain("Salvo");
  });

  it("conflito: 'carregar a versão salva' troca a tela pelo texto do outro lugar", async () => {
    const { user, fake } = setup();
    await createFirstNote(user);
    fake.touch("n1", { body: "texto vindo de outra janela" });
    const body = screen.getByLabelText("Texto da nota") as HTMLTextAreaElement;
    await user.type(body, "meu texto");
    await settle();

    await user.click(await screen.findByRole("button", { name: "Carregar a versão salva" }));
    await settle();

    expect(body.value).toBe("texto vindo de outra janela");
    expect(fake.notes.get("n1")?.body).toBe("texto vindo de outra janela");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("fixar e desafixar atualizam o botão e a lista", async () => {
    const { user } = setup();
    await createFirstNote(user);

    await user.click(screen.getByRole("button", { name: "Fixar" }));
    expect(await screen.findByRole("button", { name: "Desafixar" })).toBeTruthy();
    expect(await screen.findByText("Fixada")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Desafixar" }));
    expect(await screen.findByRole("button", { name: "Fixar" })).toBeTruthy();
    expect(screen.queryByText("Fixada")).toBeNull();
  });

  it("excluir manda para a lixeira, de onde dá para restaurar", async () => {
    const { user } = setup();
    await createFirstNote(user);

    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(await screen.findByText(/Nenhuma nota ainda/)).toBeTruthy();
    expect(screen.getByText("Selecione ou crie uma nota.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Lixeira" }));
    const item = await screen.findByRole("button", { name: "Sem título" });
    await user.click(item);
    await user.click(await screen.findByRole("button", { name: "Restaurar" }));

    expect(await screen.findByText("A lixeira está vazia.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Notas" }));
    expect(await screen.findByRole("button", { name: "Sem título" })).toBeTruthy();
  });

  it("apagar de vez exige confirmação e só então apaga", async () => {
    const { user, fake } = setup();
    await createFirstNote(user);
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    await user.click(await screen.findByRole("button", { name: "Lixeira" }));
    await user.click(await screen.findByRole("button", { name: "Sem título" }));

    await user.click(await screen.findByRole("button", { name: "Apagar de vez" }));
    expect(screen.getByText("Isto não pode ser desfeito.")).toBeTruthy();
    expect(fake.notes.has("n1")).toBe(true); // ainda não apagou

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByText("A lixeira está vazia.")).toBeTruthy();
    expect(fake.notes.has("n1")).toBe(false);
  });

  it("cancelar a confirmação não apaga nada", async () => {
    const { user, fake } = setup();
    await createFirstNote(user);
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    await user.click(await screen.findByRole("button", { name: "Lixeira" }));
    await user.click(await screen.findByRole("button", { name: "Sem título" }));
    await user.click(await screen.findByRole("button", { name: "Apagar de vez" }));

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByText("Isto não pode ser desfeito.")).toBeNull();
    expect(fake.notes.has("n1")).toBe(true);
  });

  it("Ctrl+N cria uma nota", async () => {
    const { user } = setup();
    await screen.findByText(/Nenhuma nota ainda/);

    await user.keyboard("{Control>}n{/Control}");

    expect(await screen.findByLabelText("Título")).toBeTruthy();
  });

  it("a lista se atualiza sozinha quando chega um evento de fora da tela", async () => {
    const { fake, events } = setup();
    await screen.findByText(/Nenhuma nota ainda/);

    // Alguém (outra janela, outro módulo) cria uma nota e o evento é publicado.
    const created = await fake.gateway.create({ title: "Vinda de fora", body: "" });
    await act(async () => {
      events.emit("note.created", { id: created.id });
    });

    expect(await screen.findByRole("button", { name: "Vinda de fora" })).toBeTruthy();
  });

  it("trocar de nota salva antes o que estava pendente (nada se perde)", async () => {
    const { user, fake } = setup();
    await createFirstNote(user); // n1
    await user.click(await screen.findByRole("button", { name: "Nova nota" })); // n2
    await screen.findByLabelText("Título");
    const list = await screen.findByRole("list", { name: "Notas" });
    // Abre a n1, edita e troca de nota ANTES da pausa de 500 ms.
    const items = within(list).getAllByRole("button");
    await user.click(items[1]!);
    const title = await screen.findByLabelText("Título");
    await user.clear(title);
    await user.type(title, "Editada às pressas");

    await user.click(within(list).getAllByRole("button")[0]!);
    await settle();

    const titles = [...fake.notes.values()].map((n) => n.title);
    expect(titles).toContain("Editada às pressas");
  });
});
