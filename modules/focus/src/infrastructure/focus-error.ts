import { FocusError, type FocusErrorCode } from "../domain/errors.ts";

const KNOWN_CODES: ReadonlySet<string> = new Set<FocusErrorCode>([
  "focus.name-invalid",
  "focus.icon-invalid",
  "focus.frequency-invalid",
  "focus.day-invalid",
  "focus.not-found",
  "focus.archived",
  "focus.session-invalid",
  "focus.settings-invalid",
  "focus.timer-invalid",
  "focus.internal",
]);

function isErrorPayload(value: unknown): value is { code: string; message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

/** Converte o que o Tauri rejeita em um `FocusError`; código desconhecido vira `focus.internal`. */
export function toFocusError(raw: unknown): FocusError {
  if (raw instanceof FocusError) return raw;
  if (isErrorPayload(raw) && KNOWN_CODES.has(raw.code)) {
    return new FocusError(raw.code as FocusErrorCode, raw.message);
  }
  const message = isErrorPayload(raw)
    ? raw.message
    : raw instanceof Error
      ? raw.message
      : String(raw);
  return new FocusError("focus.internal", message, { cause: raw });
}
