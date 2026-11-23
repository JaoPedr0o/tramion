import type { EmojiData } from "../application/emoji.ts";

/**
 * Carrega a base de emojis que acompanha o editor (só quando o seletor é aberto). Tenta em português e,
 * se esse idioma não existir, em inglês.
 */
export async function loadEmojiData(): Promise<EmojiData> {
  const { loadFrimousseData } = await import("@blocknote/core/emoji-data");
  try {
    return await loadFrimousseData("pt");
  } catch {
    return await loadFrimousseData("en");
  }
}
