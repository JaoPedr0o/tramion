/** Título da página onde as capturas rápidas se acumulam. */
export const INBOX_TITLE = "Caixa de entrada";
/** Símbolo da caixa de entrada. */
export const INBOX_ICON = "📥";
/** Máximo de caracteres de uma captura. */
export const MAX_CAPTURE_CHARS = 20_000;

/** O que uma captura vira: o título (primeira linha), o texto simples e os blocos das demais linhas. */
export interface CapturedPage {
  readonly title: string;
  readonly body: string;
  readonly blocks: ReadonlyArray<{
    type: "paragraph";
    content: ReadonlyArray<{ type: "text"; text: string; styles: Record<string, never> }>;
    children: never[];
  }>;
}

/**
 * Transforma o texto digitado na captura rápida numa página: a primeira linha não vazia é o título (até 200 caracteres)
 * e cada linha seguinte vira um parágrafo. Devolve `null` se não há texto.
 */
export function captureToPage(raw: string): CapturedPage | null {
  const lines = raw
    .slice(0, MAX_CAPTURE_CHARS)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const [first, ...rest] = lines;
  if (first === undefined) return null;
  return {
    title: first.slice(0, 200),
    body: rest.join("\n"),
    blocks: rest.map((text) => ({
      type: "paragraph" as const,
      content: [{ type: "text" as const, text, styles: {} }],
      children: [],
    })),
  };
}

/** A Caixa de entrada entre as páginas da raiz (sem diferenciar maiúsculas), se já existir. */
export function findInbox<
  T extends { title: string; parentId: string | null; isDatabase: boolean },
>(pages: readonly T[]): T | undefined {
  return pages.find(
    (page) =>
      page.parentId === null &&
      !page.isDatabase &&
      page.title.trim().toLowerCase() === INBOX_TITLE.toLowerCase(),
  );
}
