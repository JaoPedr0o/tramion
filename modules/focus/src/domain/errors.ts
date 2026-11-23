/** Códigos de erro estáveis do módulo (definidos no Rust). A interface os traduz em mensagens. */
export type FocusErrorCode =
  | "focus.name-invalid"
  | "focus.icon-invalid"
  | "focus.frequency-invalid"
  | "focus.day-invalid"
  | "focus.not-found"
  | "focus.archived"
  | "focus.session-invalid"
  | "focus.settings-invalid"
  | "focus.timer-invalid"
  | "focus.internal";

/** Erro conhecido do módulo Foco. A interface decide a mensagem a partir do `code`. */
export class FocusError extends Error {
  readonly code: FocusErrorCode;

  constructor(code: FocusErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FocusError";
    this.code = code;
  }
}
