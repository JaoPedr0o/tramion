import { NotesError, type NotesErrorCode } from "../domain/errors.ts";

const KNOWN_CODES: ReadonlySet<string> = new Set<NotesErrorCode>([
  "notes.title-empty",
  "notes.title-too-long",
  "notes.content-invalid",
  "notes.content-too-large",
  "notes.not-found",
  "notes.in-trash",
  "notes.not-in-trash",
  "notes.parent-not-found",
  "notes.parent-in-trash",
  "notes.cycle",
  "notes.conflict",
  "notes.internal",
]);

function isErrorPayload(value: unknown): value is { code: string; message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

/**
 * Converte o que o Tauri rejeita em um `NotesError`. O que vier de fora é dado não confiável:
 * um código desconhecido (ou qualquer outra coisa) vira `notes.internal`, nunca é repassado cru.
 */
export function toNotesError(raw: unknown): NotesError {
  if (raw instanceof NotesError) return raw;
  if (isErrorPayload(raw) && KNOWN_CODES.has(raw.code)) {
    return new NotesError(raw.code as NotesErrorCode, raw.message);
  }
  const message = isErrorPayload(raw)
    ? raw.message
    : raw instanceof Error
      ? raw.message
      : String(raw);
  return new NotesError("notes.internal", message, { cause: raw });
}
