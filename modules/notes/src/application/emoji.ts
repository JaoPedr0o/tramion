/** Um emoji do seletor de símbolos da página. */
export interface EmojiEntry {
  readonly emoji: string;
  readonly label: string;
  readonly tags?: readonly string[];
  readonly category: number;
}

export interface EmojiData {
  readonly emojis: readonly EmojiEntry[];
  readonly categories: ReadonlyArray<{ readonly index: number; readonly label: string }>;
}

/** Tira acentos e maiúsculas para a busca ("coração" encontra "CORACAO"). */
const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Emojis cujo nome ou palavras-chave contêm todas as palavras da busca. Busca vazia devolve todos. */
export function filterEmojis(emojis: readonly EmojiEntry[], query: string): EmojiEntry[] {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...emojis];
  return emojis.filter((entry) => {
    const haystack = plain([entry.label, ...(entry.tags ?? [])].join(" "));
    return words.every((word) => haystack.includes(word));
  });
}
