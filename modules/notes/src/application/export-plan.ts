import type { NoteSummary } from "../domain/note.ts";

/** Onde uma página vai na exportação: as pastas dos ancestrais e, por último, o nome do arquivo (sem `.md`). */
export interface ExportEntry {
  readonly id: string;
  readonly path: readonly string[];
}

/**
 * Planeja os caminhos da exportação completa, espelhando a hierarquia: uma página com subpáginas vira um arquivo `Pai.md`
 * e uma pasta `Pai/` com as filhas. Nomes iguais entre irmãs (sem diferenciar maiúsculas) ganham " (2)", " (3)"...,
 * então nenhuma página sobrescreve outra. A ordem é a da árvore (irmãs na ordem da lista).
 */
export function planExport(pages: readonly NoteSummary[]): ExportEntry[] {
  const children = new Map<string | null, NoteSummary[]>();
  const known = new Set(pages.map((page) => page.id));
  for (const page of pages) {
    // Página cujo pai não está na lista (por exemplo, o pai está na lixeira) sobe para a raiz.
    const parent = page.parentId !== null && known.has(page.parentId) ? page.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), page]);
  }

  const out: ExportEntry[] = [];
  const walk = (
    parent: string | null,
    folders: readonly string[],
    visiting: ReadonlySet<string>,
  ) => {
    const used = new Set<string>();
    for (const page of children.get(parent) ?? []) {
      if (visiting.has(page.id)) continue; // defesa contra ciclos nos dados
      const base = page.title.trim() || "Sem título";
      let name = base;
      for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`;
      used.add(name.toLowerCase());
      out.push({ id: page.id, path: [...folders, name] });
      walk(page.id, [...folders, name], new Set([...visiting, page.id]));
    }
  };
  walk(null, [], new Set());
  return out;
}
