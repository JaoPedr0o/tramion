import type { Block } from "./page-content.ts";

/**
 * Blocos lado a lado (colunas), como no Notion. São feitos só com a aninhação que o editor já tem: uma LISTA DE COLUNAS
 * (`columnList`) cujos filhos são COLUNAS (`column`), e cada coluna tem como filhos os blocos de verdade. Nada disso
 * depende do editor: são funções puras sobre a árvore de blocos, que o editor chama ao soltar um bloco ao lado de outro.
 */

export const COLUMN_LIST = "columnList";
export const COLUMN = "column";

/** Máximo de colunas lado a lado (mais que isso fica estreito demais, mesmo no computador). */
export const MAX_COLUMNS = 5;

export type Side = "left" | "right";

const withChildren = (block: Block, children: readonly Block[]): Block => ({ ...block, children });

/** Procura um bloco pelo id, em qualquer nível. */
export function findBlock(blocks: readonly Block[], id: string): Block | null {
  for (const block of blocks) {
    if (block.id === id) return block;
    const inside = findBlock(block.children ?? [], id);
    if (inside) return inside;
  }
  return null;
}

/** O bloco `ancestor` contém (ou é) o bloco `id`? */
export function containsId(ancestor: Block, id: string): boolean {
  return ancestor.id === id || (ancestor.children ?? []).some((child) => containsId(child, id));
}

/** A árvore sem o bloco `id` (e tudo o que há dentro dele). */
function without(blocks: readonly Block[], id: string): Block[] {
  return blocks
    .filter((block) => block.id !== id)
    .map((block) =>
      block.children?.length ? withChildren(block, without(block.children, id)) : block,
    );
}

const column = (children: readonly Block[]): Block => ({ type: COLUMN, props: {}, children });

/** Uma lista com `count` colunas, cada uma com um parágrafo vazio (para o "/" do menu). Sem ids: o editor os cria. */
export function newColumns(count: number): Block {
  const total = Math.min(Math.max(Math.trunc(count), 2), MAX_COLUMNS);
  return {
    type: COLUMN_LIST,
    props: {},
    children: Array.from({ length: total }, () => column([{ type: "paragraph", children: [] }])),
  };
}

/**
 * Coloca o bloco `draggedId` ao lado (esquerda ou direita) do bloco `targetId`.
 *
 * - Se o alvo está solto na página, ele e o bloco arrastado viram duas colunas lado a lado.
 * - Se o alvo já está numa coluna, o bloco arrastado ganha uma coluna nova ao lado dela (até `MAX_COLUMNS`).
 *
 * Devolve a árvore nova, ou `null` quando o pedido não faz sentido (mesmo bloco, soltar um bloco dentro dele mesmo,
 * arrastar a estrutura das colunas, ou passar do máximo de colunas), para quem chama não mexer em nada.
 */
export function dropBeside(
  blocks: readonly Block[],
  targetId: string,
  draggedId: string,
  side: Side,
): Block[] | null {
  if (targetId === draggedId) return null;
  const dragged = findBlock(blocks, draggedId);
  const target = findBlock(blocks, targetId);
  if (!dragged || !target) return null;
  if (dragged.type === COLUMN_LIST || dragged.type === COLUMN) return null;
  if (containsId(dragged, targetId)) return null;
  if (target.type === COLUMN_LIST) return null;

  const rest = without(blocks, draggedId);
  const placed = placeBeside(rest, targetId, dragged, side);
  return placed ? normalizeColumns(placed).blocks : null;
}

/** Faz a troca na árvore: acha o alvo e põe o bloco arrastado ao lado dele. `null` se não couber. */
function placeBeside(
  blocks: readonly Block[],
  targetId: string,
  dragged: Block,
  side: Side,
): Block[] | null {
  const out: Block[] = [];
  for (const block of blocks) {
    if (
      block.type === COLUMN_LIST &&
      (block.children ?? []).some((col) => containsId(col, targetId))
    ) {
      const cols = block.children ?? [];
      const at = cols.findIndex((col) => containsId(col, targetId));
      if (cols.length >= MAX_COLUMNS) return null;
      const next = [...cols];
      next.splice(side === "left" ? at : at + 1, 0, column([dragged]));
      out.push(withChildren(block, next));
      continue;
    }
    if (block.id === targetId) {
      const pair =
        side === "left"
          ? [column([dragged]), column([block])]
          : [column([block]), column([dragged])];
      out.push({ type: COLUMN_LIST, props: {}, children: pair });
      continue;
    }
    if (block.children?.length) {
      const inner = placeBeside(block.children, targetId, dragged, side);
      if (inner === null) return null;
      out.push(withChildren(block, inner));
      continue;
    }
    out.push(block);
  }
  return out;
}

/**
 * Deixa a árvore de colunas sempre válida: tira colunas vazias; uma lista com uma coluna só (ou nenhuma) deixa de existir
 * e seus blocos voltam para a página; uma coluna fora de uma lista é desfeita; e um bloco que não é coluna dentro de uma
 * lista (por exemplo, depois de "Shift + Tab") sai para depois da lista. `changed` diz se algo mudou, para o editor só
 * mexer no documento quando preciso.
 */
export function normalizeColumns(blocks: readonly Block[]): { blocks: Block[]; changed: boolean } {
  const walk = (list: readonly Block[]): Block[] => {
    const out: Block[] = [];
    for (const block of list) {
      if (block.type === COLUMN_LIST) {
        // As colunas da lista são tratadas aqui, junto com a lista (e não como "colunas soltas").
        const raw = block.children ?? [];
        const columns = raw
          .filter((child) => child.type === COLUMN)
          .map((child) => withChildren(child, walk(child.children ?? [])))
          .filter((child) => (child.children ?? []).length > 0);
        const strays = walk(raw.filter((child) => child.type !== COLUMN));
        if (columns.length >= 2) out.push(withChildren(block, columns), ...strays);
        else out.push(...columns.flatMap((child) => child.children ?? []), ...strays);
      } else if (block.type === COLUMN) {
        out.push(...walk(block.children ?? [])); // coluna fora de uma lista: desfaz
      } else {
        out.push(block.children?.length ? withChildren(block, walk(block.children)) : block);
      }
    }
    return out;
  };

  const result = walk(blocks);
  const changed = JSON.stringify(result) !== JSON.stringify(blocks);
  return { blocks: changed ? result : [...blocks], changed };
}
