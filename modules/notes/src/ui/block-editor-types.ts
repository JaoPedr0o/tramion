import type { Ref } from "react";
import type { Block } from "../application/page-content.ts";
import type { NoteSummary } from "../domain/note.ts";

/** O que a página pode pedir ao editor de blocos. */
export interface BlockEditorHandle {
  focus(): void;
}

/**
 * Contrato do editor de blocos. A biblioteca (BlockNote) fica atrás deste contrato, num único arquivo
 * (`BlockEditor.tsx`): quem usa o editor não conhece a biblioteca, e os testes usam um editor falso.
 */
export interface BlockEditorProps {
  /** Blocos para abrir (lidos uma vez; use `key` para recarregar). */
  initialBlocks: readonly Block[];
  /**
   * Subpáginas ATIVAS desta página, ou `null` enquanto a lista não carregou. Com `null` o editor NÃO
   * sincroniza os blocos de subpágina: sincronizar com uma lista ainda vazia apagaria blocos válidos.
   */
  childPages: ReadonlyMap<string, NoteSummary> | null;
  /** Título atual de uma página (para o texto do bloco de subpágina); `null` = indisponível. */
  titleOf(pageId: string): string | null;
  /** O conteúdo mudou. */
  onChange(change: { blocks: readonly Block[]; plainText: string }): void;
  /** O usuário apagou do texto o bloco de uma subpágina. */
  onChildPageRemoved(pageId: string): void;
  /** "/Página": cria a subpágina e devolve o id (ou `null` se falhou). */
  onCreateSubpage(): Promise<string | null>;
  onOpenPage(pageId: string): void;
  handleRef?: Ref<BlockEditorHandle>;
}
