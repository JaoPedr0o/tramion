/**
 * "Transformar em": os tipos de bloco para os quais um bloco de texto pode ser convertido, como no menu do
 * bloco do Notion. O texto do bloco é preservado.
 */
export interface TurnIntoOption {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly props?: Readonly<Record<string, unknown>>;
}

export const TURN_INTO_OPTIONS: readonly TurnIntoOption[] = [
  { id: "paragraph", label: "Texto", type: "paragraph" },
  { id: "heading-1", label: "Título 1", type: "heading", props: { level: 1 } },
  { id: "heading-2", label: "Título 2", type: "heading", props: { level: 2 } },
  { id: "heading-3", label: "Título 3", type: "heading", props: { level: 3 } },
  { id: "bullet", label: "Lista com marcadores", type: "bulletListItem" },
  { id: "numbered", label: "Lista numerada", type: "numberedListItem" },
  { id: "check", label: "Lista de tarefas", type: "checkListItem" },
  { id: "toggle", label: "Lista alternável", type: "toggleListItem" },
  { id: "quote", label: "Citação", type: "quote" },
  { id: "code", label: "Código", type: "codeBlock" },
];

/** Só blocos de texto podem ser transformados; imagem, vídeo, tabela, subpágina etc. não. */
export const TURNABLE_TYPES: ReadonlySet<string> = new Set(
  TURN_INTO_OPTIONS.map((option) => option.type),
);

/** O bloco já é desse tipo? (títulos se distinguem pelo nível.) */
export function isCurrentOption(
  block: { type: string; props?: { level?: unknown } },
  option: TurnIntoOption,
): boolean {
  if (block.type !== option.type) return false;
  return option.type !== "heading" || block.props?.level === option.props?.level;
}
