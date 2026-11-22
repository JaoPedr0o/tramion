import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotesError } from "../domain/errors.ts";
import { aNote } from "../test-support.ts";
import { createNoteAutosaver, type Draft, type SaveStatus } from "./note-autosaver.ts";

const draft = (title: string, body = ""): Draft => ({ title, body });

/** Salvador falso que registra cada chamada e devolve versões crescentes (como o Rust). */
function setup(saveImpl?: (d: Draft, expected: number) => Promise<ReturnType<typeof aNote>>) {
  const calls: Array<{ draft: Draft; expected: number }> = [];
  const statuses: SaveStatus[] = [];
  let clock = 100;
  const save =
    saveImpl ??
    (async (d: Draft, expected: number) => {
      calls.push({ draft: d, expected });
      clock += 1;
      return aNote({ title: d.title, body: d.body, updatedAt: clock });
    });
  const wrapped = async (d: Draft, expected: number) => {
    if (saveImpl) calls.push({ draft: d, expected });
    return save(d, expected);
  };
  const autosaver = createNoteAutosaver({
    initialUpdatedAt: 100,
    save: wrapped,
    onStatus: (s) => statuses.push(s),
    delayMs: 500,
  });
  return { autosaver, calls, statuses };
}

describe("salvamento automático", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("só salva depois da pausa e junta várias mudanças numa só", async () => {
    const { autosaver, calls, statuses } = setup();

    autosaver.change(draft("a"));
    await vi.advanceTimersByTimeAsync(300);
    autosaver.change(draft("ab"));
    await vi.advanceTimersByTimeAsync(300);
    expect(calls).toHaveLength(0); // a pausa recomeçou a cada tecla

    await vi.advanceTimersByTimeAsync(500);

    expect(calls).toEqual([{ draft: draft("ab"), expected: 100 }]);
    expect(statuses).toEqual(["dirty", "dirty", "saving", "saved"]);
  });

  it("nunca tem dois salvamentos ao mesmo tempo: o segundo espera e sai com a versão nova", async () => {
    let release!: () => void;
    let concurrent = 0;
    let maxConcurrent = 0;
    const { autosaver, calls } = setup(async (d, expected) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      if (calls.length === 1) await new Promise<void>((resolve) => (release = resolve));
      concurrent -= 1;
      return aNote({ title: d.title, updatedAt: expected + 1 });
    });

    autosaver.change(draft("primeiro"));
    await vi.advanceTimersByTimeAsync(500); // 1º salvamento começa e fica preso
    autosaver.change(draft("segundo"));
    await vi.advanceTimersByTimeAsync(600); // a pausa do 2º vence, mas o 1º ainda não terminou
    expect(calls).toHaveLength(1);

    release();
    await vi.advanceTimersByTimeAsync(600);

    expect(maxConcurrent).toBe(1);
    expect(calls.map((c) => [c.draft.title, c.expected])).toEqual([
      ["primeiro", 100],
      ["segundo", 101], // saiu com a versão devolvida pelo 1º, não com a antiga
    ]);
  });

  it("em conflito, para de salvar, mantém o texto e avisa", async () => {
    const conflict = new NotesError("notes.conflict", "mudou");
    const statuses: SaveStatus[] = [];
    let calls = 0;
    const autosaver = createNoteAutosaver({
      initialUpdatedAt: 100,
      save: async () => {
        calls += 1;
        throw conflict;
      },
      onStatus: (s) => statuses.push(s),
    });

    autosaver.change(draft("meu texto"));
    await vi.advanceTimersByTimeAsync(500);
    autosaver.change(draft("meu texto 2"));
    await vi.advanceTimersByTimeAsync(2000);

    expect(calls).toBe(1); // não insiste
    expect(statuses.at(-1)).toBe("conflict");
  });

  it("se continuou digitando durante um salvamento que acaba em conflito, não tenta de novo sozinho", async () => {
    let release!: () => void;
    let calls = 0;
    const autosaver = createNoteAutosaver({
      initialUpdatedAt: 100,
      save: async () => {
        calls += 1;
        await new Promise<void>((resolve) => (release = resolve));
        throw new NotesError("notes.conflict", "mudou");
      },
      onStatus: () => {},
    });

    autosaver.change(draft("a"));
    await vi.advanceTimersByTimeAsync(500); // o salvamento começa e fica esperando
    autosaver.change(draft("ab")); // digitou mais: a pausa é armada ANTES de o conflito chegar
    release(); // o conflito chega
    await vi.advanceTimersByTimeAsync(2000); // a pausa vence depois do conflito

    expect(calls).toBe(1);
  });

  it("flush durante um conflito não envia nada", async () => {
    let calls = 0;
    const autosaver = createNoteAutosaver({
      initialUpdatedAt: 100,
      save: async () => {
        calls += 1;
        throw new NotesError("notes.conflict", "mudou");
      },
      onStatus: () => {},
    });
    autosaver.change(draft("a"));
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toBe(1);

    await autosaver.flush(); // por exemplo, o botão Excluir chama isto

    expect(calls).toBe(1);
  });

  it("'manter o meu texto' salva o rascunho mais recente sobre a versão atual", async () => {
    const conflict = new NotesError("notes.conflict", "mudou");
    const sent: Array<[string, number]> = [];
    let first = true;
    const autosaver = createNoteAutosaver({
      initialUpdatedAt: 100,
      save: async (d, expected) => {
        if (first) {
          first = false;
          throw conflict;
        }
        sent.push([d.title, expected]);
        return aNote({ title: d.title, updatedAt: expected + 1 });
      },
      onStatus: () => {},
    });
    autosaver.change(draft("minha versão"));
    await vi.advanceTimersByTimeAsync(500);

    await autosaver.keepMine(250); // versão atual do servidor, obtida pela interface

    expect(sent).toEqual([["minha versão", 250]]);
  });

  it("'carregar a versão salva' descarta o rascunho e volta ao normal", async () => {
    const conflict = new NotesError("notes.conflict", "mudou");
    const statuses: SaveStatus[] = [];
    const saved: Array<[string, number]> = [];
    let first = true;
    const autosaver = createNoteAutosaver({
      initialUpdatedAt: 100,
      save: async (d, expected) => {
        if (first) {
          first = false;
          throw conflict;
        }
        saved.push([d.title, expected]);
        return aNote({ updatedAt: expected + 1 });
      },
      onStatus: (s) => statuses.push(s),
    });
    autosaver.change(draft("minha versão"));
    await vi.advanceTimersByTimeAsync(500);

    autosaver.reset(250);
    await vi.advanceTimersByTimeAsync(2000);

    expect(statuses.at(-1)).toBe("saved");
    expect(saved).toEqual([]); // o rascunho descartado nunca é enviado

    autosaver.change(draft("depois"));
    await vi.advanceTimersByTimeAsync(500);
    expect(saved).toEqual([["depois", 250]]); // e a edição seguinte parte da versão carregada
  });

  it("título recusado vira 'invalid', mantém o texto e tenta de novo na próxima mudança", async () => {
    const statuses: SaveStatus[] = [];
    let calls = 0;
    const autosaver = createNoteAutosaver({
      initialUpdatedAt: 100,
      save: async (d) => {
        calls += 1;
        if (d.title.trim() === "") throw new NotesError("notes.title-empty", "vazio");
        return aNote({ title: d.title, updatedAt: 101 });
      },
      onStatus: (s) => statuses.push(s),
    });

    autosaver.change(draft(""));
    await vi.advanceTimersByTimeAsync(2000);
    expect(statuses.at(-1)).toBe("invalid");
    expect(calls).toBe(1); // não fica em laço tentando o mesmo texto vazio

    autosaver.change(draft("agora tem título"));
    await vi.advanceTimersByTimeAsync(500);
    expect(statuses.at(-1)).toBe("saved");
  });

  it("falha inesperada vira 'error' e não repete sozinha", async () => {
    const statuses: SaveStatus[] = [];
    let calls = 0;
    const autosaver = createNoteAutosaver({
      initialUpdatedAt: 100,
      save: async () => {
        calls += 1;
        throw new Error("disco cheio");
      },
      onStatus: (s) => statuses.push(s),
    });

    autosaver.change(draft("a"));
    await vi.advanceTimersByTimeAsync(5000);

    expect(statuses.at(-1)).toBe("error");
    expect(calls).toBe(1);
  });

  it("flush salva na hora o que estiver pendente", async () => {
    const { autosaver, calls } = setup();
    autosaver.change(draft("urgente"));

    await autosaver.flush();

    expect(calls).toEqual([{ draft: draft("urgente"), expected: 100 }]);
  });

  it("fechar salva uma última vez o que estiver pendente e não avisa mais mudanças de estado", async () => {
    const { autosaver, calls, statuses } = setup();
    autosaver.change(draft("antes de trocar de nota"));
    const before = statuses.length;

    autosaver.close();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);

    expect(calls).toHaveLength(1);
    expect(statuses).toHaveLength(before); // nada de setState depois de desmontar
  });

  it("fechar sem nada pendente não salva", async () => {
    const { autosaver, calls } = setup();

    autosaver.close();
    await vi.advanceTimersByTimeAsync(2000);

    expect(calls).toHaveLength(0);
  });
});
