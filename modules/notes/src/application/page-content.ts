/**
 * Funções puras sobre o conteúdo em blocos de uma página. O editor (BlockNote) é o único que sabe o que
 * cada bloco é por dentro; aqui só se olha o necessário: o texto, e os blocos de SUBPÁGINA.
 */

/** Um bloco do editor, visto de forma genérica (só o que interessa aqui). */
export interface Block {
  readonly id?: string;
  readonly type: string;
  readonly props?: Record<string, unknown>;
  readonly content?: unknown;
  readonly children?: readonly Block[];
}

/** O tipo do bloco que aponta para uma subpágina. */
export const CHILD_PAGE = "childPage";

/** Cada linha de um texto simples vira um parágrafo. Texto vazio não gera bloco nenhum. */
export function textToBlocks(text: string): Block[] {
  if (text.trim() === "") return [];
  return text.split(/\r?\n/).map((line) => ({ type: "paragraph", content: line }));
}

/**
 * Blocos para abrir no editor. Páginas criadas antes dos blocos têm `content = "[]"` e só o texto simples:
 * aqui o texto é convertido em parágrafos (a conversão é gravada na primeira edição).
 */
export function parseContent(content: string, body: string): Block[] {
  try {
    const parsed: unknown = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as Block[];
  } catch {
    // Conteúdo ilegível: cai na conversão do texto simples (o banco já recusa JSON inválido).
  }
  return textToBlocks(body);
}

function inlineText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        const inline = item as { type?: string; text?: unknown; content?: unknown } | null;
        if (inline?.type === "link") return inlineText(inline.content);
        return typeof inline?.text === "string" ? inline.text : "";
      })
      .join("");
  }
  const table = content as { rows?: unknown } | null;
  if (table && Array.isArray(table.rows)) {
    return table.rows
      .map((row: { cells?: unknown[] }) =>
        (row.cells ?? [])
          .map((cell) => inlineText((cell as { content?: unknown })?.content ?? cell))
          .join("\t"),
      )
      .join("\n");
  }
  return "";
}

/** O texto simples da página (um bloco por linha, blocos vazios e subpáginas ficam de fora). */
export function blocksToPlainText(blocks: readonly Block[]): string {
  const lines: string[] = [];
  const walk = (list: readonly Block[]) => {
    for (const block of list) {
      if (block.type !== CHILD_PAGE) {
        const text = inlineText(block.content);
        if (text !== "") lines.push(text);
      }
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  return lines.join("\n");
}

function childPageBlocks(
  blocks: readonly Block[],
): Array<{ id: string | undefined; pageId: string }> {
  const found: Array<{ id: string | undefined; pageId: string }> = [];
  const walk = (list: readonly Block[]) => {
    for (const block of list) {
      if (block.type === CHILD_PAGE) {
        const pageId = block.props?.pageId;
        found.push({ id: block.id, pageId: typeof pageId === "string" ? pageId : "" });
      }
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  return found;
}

/** Ids das páginas apontadas pelos blocos de subpágina, na ordem em que aparecem. */
export function childPageIds(blocks: readonly Block[]): string[] {
  return childPageBlocks(blocks).map((block) => block.pageId);
}

/** Subpáginas cujo bloco estava no texto antes e já não está agora (o usuário apagou o bloco). */
export function removedChildPageIds(before: readonly string[], after: readonly string[]): string[] {
  const now = new Set(after);
  return [...new Set(before)].filter((id) => !now.has(id));
}

export interface ChildPageSyncPlan {
  /** Subpáginas ativas que ainda não têm bloco: ganham um no fim. */
  toInsert: string[];
  /** Ids de BLOCOS a remover: apontam para página que já não é filha desta, ou repetem outro bloco. */
  toRemove: string[];
}

/**
 * Deixa os blocos de subpágina consistentes com a árvore (que é a fonte da hierarquia): toda subpágina ativa
 * tem exatamente um bloco; blocos de páginas que saíram (movidas ou excluídas) e duplicatas são removidos.
 *
 * `keep` protege páginas recém-criadas, que ainda não apareceram na lista de subpáginas (a lista chega
 * um instante depois do bloco ser inserido): sem isso o bloco novo seria removido na hora.
 */
export function planChildPageSync(
  blocks: readonly Block[],
  activeChildIds: readonly string[],
  keep: ReadonlySet<string> = new Set(),
): ChildPageSyncPlan {
  const active = new Set(activeChildIds);
  const seen = new Set<string>();
  const toRemove: string[] = [];

  for (const { id, pageId } of childPageBlocks(blocks)) {
    const valid = active.has(pageId) || keep.has(pageId);
    if ((!valid || seen.has(pageId)) && id !== undefined) toRemove.push(id);
    else if (valid) seen.add(pageId);
  }

  return { toInsert: activeChildIds.filter((id) => !seen.has(id)), toRemove };
}
