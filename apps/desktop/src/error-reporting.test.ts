// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

import { installErrorReporting } from "./error-reporting";

describe("installErrorReporting", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it("envia erros não tratados ao Rust", () => {
    const target = new EventTarget() as unknown as Window;
    installErrorReporting(target);

    const event = new Event("error") as ErrorEvent;
    Object.assign(event, {
      message: "boom",
      filename: "a.js",
      lineno: 3,
      error: new Error("boom"),
    });
    target.dispatchEvent(event);

    expect(invokeMock).toHaveBeenCalledWith(
      "plugin:notes|report_error",
      expect.objectContaining({ message: expect.stringContaining("boom (a.js:3)") }),
    );
  });

  it("envia promessas rejeitadas, com Error ou texto", () => {
    const target = new EventTarget() as unknown as Window;
    installErrorReporting(target);

    for (const reason of [new Error("falhou"), "texto"]) {
      const event = new Event("unhandledrejection");
      Object.assign(event, { reason });
      target.dispatchEvent(event);
    }

    expect(invokeMock.mock.calls[0]![1].message).toContain("falhou");
    expect(invokeMock.mock.calls[1]![1].message).toContain("promessa rejeitada: texto");
  });

  it("se o envio falhar, não gera outro erro", async () => {
    invokeMock.mockRejectedValue(new Error("sem ponte"));
    const target = new EventTarget() as unknown as Window;
    installErrorReporting(target);

    target.dispatchEvent(
      Object.assign(new Event("error"), { message: "x", filename: "", lineno: 0 }),
    );
    await Promise.resolve();
  });
});
