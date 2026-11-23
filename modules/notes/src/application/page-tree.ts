import type { NoteSummary } from "../domain/note.ts";

/** Funções puras para trabalhar com a árvore de páginas a partir da lista PLANA (`parentId`). */

export interface TreeNode {
  readonly page: NoteSummary;
  readonly children: readonly TreeNode[];
}

/**
 * Monta a árvore. A ordem de entrada (já por posição) é preservada entre irmãs. Uma página cujo pai não
 * está na lista (por exemplo, no meio de uma atualização) é tratada como raiz em vez de sumir.
 */
export function buildTree(pages: readonly NoteSummary[]): TreeNode[] {
  const ids = new Set(pages.map((page) => page.id));
  const childrenOf = new Map<string | null, NoteSummary[]>();
  for (const page of pages) {
    const parent = page.parentId !== null && ids.has(page.parentId) ? page.parentId : null;
    const siblings = childrenOf.get(parent) ?? [];
    siblings.push(page);
    childrenOf.set(parent, siblings);
  }

  // `visiting` protege contra ciclos em dados corrompidos: nunca entra duas vezes na mesma página.
  const build = (parent: string | null, visiting: ReadonlySet<string>): TreeNode[] =>
    (childrenOf.get(parent) ?? [])
      .filter((page) => !visiting.has(page.id))
      .map((page) => ({ page, children: build(page.id, new Set([...visiting, page.id])) }));

  return build(null, new Set());
}

/** Ancestrais de uma página, da raiz até o pai (sem incluir a própria página). */
export function ancestorsOf(pages: readonly NoteSummary[], id: string): NoteSummary[] {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const chain: NoteSummary[] = [];
  const seen = new Set<string>([id]);
  let current = byId.get(id);
  while (current?.parentId != null && !seen.has(current.parentId)) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    chain.unshift(parent);
    seen.add(parent.id);
    current = parent;
  }
  return chain;
}

export interface VisibleRow {
  readonly page: NoteSummary;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  /** Posição (a partir de 1) entre as irmãs e quantas irmãs há: usados pela acessibilidade da árvore. */
  readonly position: number;
  readonly siblings: number;
}

/** Linhas que aparecem na tela, na ordem: só desce em páginas expandidas. */
export function visibleRows(
  tree: readonly TreeNode[],
  expanded: ReadonlySet<string>,
): VisibleRow[] {
  const rows: VisibleRow[] = [];
  const walk = (nodes: readonly TreeNode[], depth: number) => {
    nodes.forEach((node, index) => {
      const isExpanded = node.children.length > 0 && expanded.has(node.page.id);
      rows.push({
        page: node.page,
        depth,
        hasChildren: node.children.length > 0,
        expanded: isExpanded,
        position: index + 1,
        siblings: nodes.length,
      });
      if (isExpanded) walk(node.children, depth + 1);
    });
  };
  walk(tree, 0);
  return rows;
}

export interface MoveTarget {
  /** `null` = a raiz. */
  readonly id: string | null;
  readonly title: string;
  readonly depth: number;
}

/**
 * Destinos válidos para mover uma página: a raiz e todas as páginas, EXCETO ela mesma e suas
 * descendentes (mover para dentro delas criaria um ciclo). Na ordem da árvore, com a profundidade.
 * Pular a página no percurso já pula, junto, toda a subárvore dela.
 */
export function moveTargets(pages: readonly NoteSummary[], id: string): MoveTarget[] {
  const targets: MoveTarget[] = [{ id: null, title: "Raiz", depth: 0 }];
  const walk = (nodes: readonly TreeNode[], depth: number) => {
    for (const node of nodes) {
      if (node.page.id === id) continue;
      targets.push({ id: node.page.id, title: node.page.title, depth: depth + 1 });
      walk(node.children, depth + 1);
    }
  };
  walk(buildTree(pages), 0);
  return targets;
}
