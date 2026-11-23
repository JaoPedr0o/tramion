import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotesError } from "../domain/errors.ts";
import { createTauriNotesPlatform } from "./tauri-notes-platform.ts";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${encodeURIComponent(path)}`),
}));
const invokeMock = vi.mocked(invoke);

describe("plataforma do Tauri", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.mocked(convertFileSrc).mockClear();
  });

  it("envia o arquivo como corpo bruto, com o nome codificado no cabeçalho, e devolve o endereço de exibição", async () => {
    invokeMock.mockResolvedValue("/dados/assets/abc.png");
    const file = new File([new Uint8Array([1, 2, 3])], "minha foto ç.png", { type: "image/png" });

    const url = await createTauriNotesPlatform().uploadAsset(file);

    const [command, body, options] = invokeMock.mock.calls[0]!;
    expect(command).toBe("plugin:notes|save_asset");
    expect(Array.from(body as Uint8Array)).toEqual([1, 2, 3]);
    expect(options).toEqual({ headers: { "x-file-name": encodeURIComponent("minha foto ç.png") } });
    expect(url).toBe(`asset://localhost/${encodeURIComponent("/dados/assets/abc.png")}`);
  });

  it("abre links pelo comando do módulo", async () => {
    invokeMock.mockResolvedValue(undefined);

    await createTauriNotesPlatform().openExternal("https://exemplo.com");

    expect(invokeMock).toHaveBeenCalledWith("plugin:notes|open_external", {
      url: "https://exemplo.com",
    });
  });

  it("converte as falhas do Rust em NotesError", async () => {
    invokeMock.mockImplementation(async () => {
      throw { code: "notes.asset-type-not-allowed", message: "tipo não aceito" };
    });
    const file = new File([new Uint8Array([1])], "x.exe");

    const error = await createTauriNotesPlatform()
      .uploadAsset(file)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotesError);
    expect(error).toHaveProperty("code", "notes.asset-type-not-allowed");
  });

  it("falha de abrir o link também vira NotesError", async () => {
    invokeMock.mockImplementation(async () => {
      throw { code: "notes.url-invalid", message: "inválido" };
    });

    const error = await createTauriNotesPlatform()
      .openExternal("javascript:x")
      .catch((e: unknown) => e);

    expect(error).toHaveProperty("code", "notes.url-invalid");
  });
});
