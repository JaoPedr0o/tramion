import { invoke } from "@tauri-apps/api/core";

/** Envia ao terminal do app (via Rust) qualquer erro que escape da interface, para que uma falha não suma sem rastro. */
export function installErrorReporting(target: Window = window): void {
  const send = (message: string) => {
    void invoke("plugin:notes|report_error", { message }).catch(() => {});
  };
  target.addEventListener("error", (event) => {
    send(`${event.message} (${event.filename}:${event.lineno})\n${event.error?.stack ?? ""}`);
  });
  target.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    send(
      `promessa rejeitada: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`,
    );
  });
}
