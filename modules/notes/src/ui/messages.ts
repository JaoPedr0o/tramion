import { NotesError, type NotesErrorCode } from "../domain/errors.ts";

/** Textos para o usuário, escolhidos pelo CÓDIGO do erro (o texto técnico do Rust nunca é exibido). */
const MESSAGES: Record<NotesErrorCode, string> = {
  "notes.title-empty": "O título não pode ficar vazio.",
  "notes.title-too-long": "O título é longo demais (máximo de 200 caracteres).",
  "notes.content-invalid": "O conteúdo da página não pôde ser salvo (formato inválido).",
  "notes.content-too-large": "A página é grande demais para ser salva.",
  "notes.not-found": "Esta página não existe mais.",
  "notes.in-trash": "Esta página está na lixeira.",
  "notes.not-in-trash": "Esta página não está na lixeira.",
  "notes.parent-not-found": "A página de destino não existe mais.",
  "notes.parent-in-trash": "A página de destino está na lixeira.",
  "notes.cycle": "Uma página não pode ser movida para dentro dela mesma ou de uma subpágina sua.",
  "notes.conflict": "Esta página foi alterada em outro lugar.",
  "notes.internal": "Algo deu errado. Tente novamente.",
};

export function messageFor(error: unknown): string {
  return MESSAGES[error instanceof NotesError ? error.code : "notes.internal"];
}
