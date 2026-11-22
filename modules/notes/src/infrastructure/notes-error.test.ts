import { describe, expect, it } from "vitest";
import { NotesError } from "../domain/errors.ts";
import { toNotesError } from "./notes-error.ts";

describe("toNotesError", () => {
  it("converte o payload do Rust preservando código e mensagem", () => {
    const error = toNotesError({ code: "notes.conflict", message: "versão velha" });

    expect(error).toBeInstanceOf(NotesError);
    expect(error.code).toBe("notes.conflict");
    expect(error.message).toBe("versão velha");
  });

  it("não repassa códigos desconhecidos: viram notes.internal", () => {
    const error = toNotesError({ code: "outro.modulo", message: "estranho" });

    expect(error.code).toBe("notes.internal");
    expect(error.message).toBe("estranho");
  });

  it("aceita qualquer coisa que o Tauri rejeite (texto, Error, nulo)", () => {
    expect(toNotesError("deu ruim").message).toBe("deu ruim");
    expect(toNotesError(new Error("falhou")).message).toBe("falhou");
    expect(toNotesError(undefined).code).toBe("notes.internal");
    expect(toNotesError(null).code).toBe("notes.internal");
  });

  it("não reembrulha um NotesError que já está no formato certo", () => {
    const original = new NotesError("notes.not-found", "sumiu");

    expect(toNotesError(original)).toBe(original);
  });

  it("guarda o valor original como causa quando não reconhece o formato", () => {
    const raw = { qualquer: "coisa" };

    expect(toNotesError(raw).cause).toBe(raw);
  });
});
