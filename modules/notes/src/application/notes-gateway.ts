import type { NoteSummary } from "../domain/note.ts";

/**
 * Contrato com o "mundo de fora" (o backend Rust). A aplicação e a interface só conhecem esta
 * interface; quem a cumpre pode ser o Tauri de verdade ou, nos testes, um falso em memória.
 */
export interface NotesGateway {
  list(): Promise<readonly NoteSummary[]>;
}
