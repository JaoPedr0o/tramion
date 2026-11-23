import { FocusError, type FocusErrorCode } from "../domain/errors.ts";

/** Textos para o usuário, escolhidos pelo CÓDIGO do erro (o texto técnico do Rust nunca é exibido). */
const MESSAGES: Record<FocusErrorCode, string> = {
  "focus.name-invalid": "Dê um nome ao hábito (até 100 caracteres).",
  "focus.icon-invalid": "Este símbolo não é válido.",
  "focus.frequency-invalid": "Escolha quantas vezes por semana (de 1 a 7).",
  "focus.day-invalid": "Esta data não é válida.",
  "focus.not-found": "Este hábito não existe mais.",
  "focus.archived": "Este hábito está arquivado. Desarquive para marcar dias.",
  "focus.session-invalid": "Não foi possível registrar esta sessão.",
  "focus.settings-invalid": "Os ajustes estão fora dos limites permitidos.",
  "focus.internal": "Algo deu errado. Tente novamente.",
};

export function messageFor(error: unknown): string {
  return MESSAGES[error instanceof FocusError ? error.code : "focus.internal"];
}
