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

  it("registra erros da interface pelo comando do módulo", async () => {
    invokeMock.mockResolvedValue(undefined);

    await createTauriNotesPlatform().reportError("quebrou");

    expect(invokeMock).toHaveBeenCalledWith("plugin:notes|report_error", { message: "quebrou" });
  });

  it("registrar um erro nunca falha, mesmo que o comando falhe", async () => {
    invokeMock.mockRejectedValue(new Error("sem ponte"));

    await expect(createTauriNotesPlatform().reportError("x")).resolves.toBeUndefined();
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

const plugin = vi.hoisted(() => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  createChannel: vi.fn(),
  pending: vi.fn(),
  cancel: vi.fn(),
  sendNotification: vi.fn(),
  onAction: vi.fn(),
  Importance: { High: 4 },
  Schedule: { at: vi.fn((date: Date) => ({ at: { date } })) },
}));
vi.mock("@tauri-apps/plugin-notification", () => plugin);

describe("avisos agendados", () => {
  const item = (id: number, at: number, title = `T${id}`) => ({
    id,
    at,
    title,
    body: "corpo",
    taskId: `tarefa-${id}`,
  });
  const WHEN = Date.UTC(2030, 0, 1, 12, 0);

  beforeEach(() => {
    invokeMock.mockReset();
    plugin.isPermissionGranted.mockReset().mockResolvedValue(true);
    plugin.requestPermission.mockReset();
    plugin.createChannel.mockReset();
    plugin.pending.mockReset().mockResolvedValue([]);
    plugin.cancel.mockReset();
    plugin.sendNotification.mockReset();
    plugin.onAction.mockReset();
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14)" });
  });

  it("no computador não agenda nada (o plugin mostraria tudo na hora)", async () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux x86_64)" });
    const platform = createTauriNotesPlatform();

    await platform.scheduleNotifications([item(1, WHEN)]);

    expect(platform.canScheduleNotifications).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(plugin.sendNotification).not.toHaveBeenCalled();
    expect(plugin.pending).not.toHaveBeenCalled();
  });

  it("agenda o que é novo em lote, com canal, horário e o id da tarefa", async () => {
    invokeMock.mockResolvedValue([1]);
    const platform = createTauriNotesPlatform();

    await platform.scheduleNotifications([item(1, WHEN)]);

    expect(platform.canScheduleNotifications).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("plugin:notification|batch", {
      notifications: [
        {
          id: 1,
          channelId: "tramion-lembretes",
          title: "T1",
          body: "corpo",
          extra: { taskId: "tarefa-1" },
          schedule: {
            at: { date: new Date(WHEN).toISOString(), repeating: false, allowWhileIdle: true },
          },
        },
      ],
    });
  });

  it("cancela o que sobrou e não reagenda o que não mudou", async () => {
    plugin.pending.mockResolvedValue([
      { id: 1, title: "T1", body: "corpo", schedule: { at: { date: new Date(WHEN) } } },
      { id: 2, title: "velha", body: "corpo", schedule: { at: { date: new Date(WHEN) } } },
      { id: 3, title: "T3", body: "corpo", schedule: { at: { date: new Date(WHEN) } } },
    ]);
    invokeMock.mockResolvedValue([3]);

    await createTauriNotesPlatform().scheduleNotifications([item(1, WHEN), item(3, WHEN + 60_000)]);

    expect(plugin.cancel).toHaveBeenCalledWith([2]);
    const [, args] = invokeMock.mock.calls[0]!;
    expect((args as { notifications: { id: number }[] }).notifications.map((n) => n.id)).toEqual([
      3,
    ]);
  });

  it("lista vazia só cancela, sem pedir permissão", async () => {
    plugin.isPermissionGranted.mockResolvedValue(false);
    plugin.pending.mockResolvedValue([
      { id: 9, title: "x", body: "y", schedule: { at: { date: new Date(WHEN) } } },
    ]);

    await createTauriNotesPlatform().scheduleNotifications([]);

    expect(plugin.requestPermission).not.toHaveBeenCalled();
    expect(plugin.cancel).toHaveBeenCalledWith([9]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("sem permissão não agenda", async () => {
    plugin.isPermissionGranted.mockResolvedValue(false);
    plugin.requestPermission.mockResolvedValue("denied");

    await createTauriNotesPlatform().scheduleNotifications([item(1, WHEN)]);

    expect(invokeMock).not.toHaveBeenCalled();
    expect(plugin.sendNotification).not.toHaveBeenCalled();
  });

  it("se o lote falhar, agenda uma a uma pela API do plugin", async () => {
    invokeMock.mockRejectedValue(new Error("sem batch"));

    await createTauriNotesPlatform().scheduleNotifications([item(1, WHEN)]);

    expect(plugin.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, extra: { taskId: "tarefa-1" } }),
    );
  });

  it("falhas do plugin nunca viram erro", async () => {
    plugin.pending.mockRejectedValue(new Error("quebrou"));

    await expect(
      createTauriNotesPlatform().scheduleNotifications([item(1, WHEN)]),
    ).resolves.toBeUndefined();
  });

  it("tocar na notificação entrega o id da tarefa; outras notificações são ignoradas", async () => {
    const unregister = vi.fn();
    let callback: (event: unknown) => void = () => {};
    plugin.onAction.mockImplementation(async (cb: (event: unknown) => void) => {
      callback = cb;
      return { unregister };
    });
    const heard = vi.fn();

    const stop = createTauriNotesPlatform().onNotificationOpened(heard);
    await vi.waitFor(() => expect(plugin.onAction).toHaveBeenCalled());
    await Promise.resolve();
    callback({ actionId: "tap", notification: { extra: { taskId: "abc" } } });
    callback({ actionId: "tap", notification: { extra: {} } });
    callback({ actionId: "tap", notification: null });
    stop();

    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith("abc");
    await vi.waitFor(() => expect(unregister).toHaveBeenCalled());
  });
});
