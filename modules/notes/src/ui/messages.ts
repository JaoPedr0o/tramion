import { NotesError, type NotesErrorCode } from "../domain/errors.ts";

/** Textos para o usuário, escolhidos pelo CÓDIGO do erro (o texto técnico do Rust nunca é exibido). */
const MESSAGES: Record<NotesErrorCode, string> = {
  "notes.title-empty": "O título não pode ficar vazio.",
  "notes.title-too-long": "O título é longo demais (máximo de 200 caracteres).",
  "notes.not-found": "Esta nota não existe mais.",
  "notes.in-trash": "Esta nota está na lixeira.",
  "notes.not-in-trash": "Esta nota não está na lixeira.",
  "notes.conflict": "Esta nota foi alterada em outro lugar.",
  "notes.internal": "Algo deu errado. Tente novamente.",
};

export function messageFor(error: unknown): string {
  return MESSAGES[error instanceof NotesError ? error.code : "notes.internal"];
}
