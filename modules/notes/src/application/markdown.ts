/**
 * Conversão entre os blocos do editor e Markdown, em funções puras (sem editor nem tela).
 *
 * Exportar: blocos → texto Markdown (títulos, listas, tarefas, citações, código, tabelas, imagens, links e estilos).
 * Importar: Markdown → blocos. Só links e imagens `http(s)` são aceitos (nada de `javascript:` nem caminhos locais).
 * O que o Markdown não representa (cores, menções) vira texto simples.
 */

export interface MdBlock {
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: MdBlock[];
}

interface InlineText {
  type: "text";
  text: string;
  styles: Record<string, boolean>;
}
interface InlineLink {
  type: "link";
  href: string;
  content: InlineText[];
}
type Inline = InlineText | InlineLink;

/** Tamanho máximo aceito na importação. */
export const MAX_IMPORT_CHARS = 2_000_000;

// ───────────────────────── Exportar ─────────────────────────

const escapeText = (text: string) => text.replace(/([\\`*_[\]])/g, "\\$1");

function styled(text: string, styles: Record<string, unknown>): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  const [, lead, core, trail] = match;
  if (core === "") return text;
  if (styles.code) return `${lead}\`${core}\`${trail}`;
  let out = escapeText(core!);
  if (styles.bold) out = `**${out}**`;
  if (styles.italic) out = `*${out}*`;
  if (styles.strike) out = `~~${out}~~`;
  return `${lead}${out}${trail}`;
}

/** O texto de um conteúdo em linha: estilos, links e menções (`@Título`). */
function inlineToMarkdown(content: unknown, titleOf: (id: string) => string | null): string {
  if (typeof content === "string") return escapeText(content);
  if (!Array.isArray(content)) return "";
  return content
    .map((item: Record<string, unknown>) => {
      if (item.type === "text")
        return styled(String(item.text ?? ""), (item.styles ?? {}) as Record<string, unknown>);
      if (item.type === "link") {
        const href = String(item.href ?? "");
        return `[${inlineToMarkdown(item.content, titleOf)}](${href})`;
      }
      if (item.type === "mention") {
        const id = String((item.props as Record<string, unknown> | undefined)?.pageId ?? "");
        return `@${titleOf(id) ?? "página"}`;
      }
      return "";
    })
    .join("");
}

function plainText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item: Record<string, unknown>) =>
      item.type === "link" ? plainText(item.content) : String(item.text ?? ""),
    )
    .join("");
}

const cellText = (cell: unknown, titleOf: (id: string) => string | null): string => {
  const content =
    cell && typeof cell === "object" && !Array.isArray(cell)
      ? (cell as { content?: unknown }).content
      : cell;
  return inlineToMarkdown(content, titleOf).replace(/\|/g, "\\|").replace(/\n/g, " ");
};

function tableToMarkdown(block: MdBlock, titleOf: (id: string) => string | null): string[] {
  const rows = (
    (block.content as { rows?: Array<{ cells?: unknown[] }> } | undefined)?.rows ?? []
  ).map((row) => (row.cells ?? []).map((cell) => cellText(cell, titleOf)));
  if (rows.length === 0) return [];
  const width = Math.max(...rows.map((row) => row.length));
  const pad = (row: string[]) => Array.from({ length: width }, (_, i) => row[i] ?? "");
  const line = (row: string[]) => `| ${pad(row).join(" | ")} |`;
  return [
    line(rows[0]!),
    line(Array.from({ length: width }, () => "---")),
    ...rows.slice(1).map(line),
  ];
}

/** As linhas de um bloco (sem as filhas); `number` é a posição numa lista numerada. */
function blockLines(
  block: MdBlock,
  number: number,
  titleOf: (id: string) => string | null,
): string[] {
  const props = block.props ?? {};
  const text = () => inlineToMarkdown(block.content, titleOf);
  switch (block.type) {
    case "heading":
      return [`${"#".repeat(Math.min(6, Math.max(1, Number(props.level ?? 1))))} ${text()}`];
    case "bulletListItem":
    case "toggleListItem":
      return [`- ${text()}`];
    case "numberedListItem":
      return [`${number}. ${text()}`];
    case "checkListItem":
      return [`- [${props.checked ? "x" : " "}] ${text()}`];
    case "quote":
      return text()
        .split("\n")
        .map((line) => `> ${line}`);
    case "codeBlock": {
      const language = String(props.language ?? "");
      return ["```" + (language === "text" ? "" : language), plainText(block.content), "```"];
    }
    case "image": {
      const url = String(props.url ?? "");
      return url ? [`![${String(props.caption ?? props.name ?? "")}](${url})`] : [];
    }
    case "video":
    case "audio":
    case "file": {
      const url = String(props.url ?? "");
      return url ? [`[${String(props.name || props.caption || url)}](${url})`] : [];
    }
    case "bookmark":
    case "embedVideo": {
      const url = String(props.url ?? "");
      return url ? [`<${url}>`] : [];
    }
    case "childPage":
      return [`Subpágina: ${titleOf(String(props.pageId ?? "")) ?? "sem título"}`];
    case "table":
      return tableToMarkdown(block, titleOf);
    default:
      return text() === "" ? [] : [text()];
  }
}

const LIST_TYPES = new Set([
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "toggleListItem",
]);

function renderBlocks(
  blocks: readonly MdBlock[],
  titleOf: (id: string) => string | null,
  indent: string,
): string[] {
  const out: string[] = [];
  let number = 0;
  blocks.forEach((block, index) => {
    number = block.type === "numberedListItem" ? number + 1 : 0;
    const lines = blockLines(block, number, titleOf);
    const isList = LIST_TYPES.has(block.type);
    const previous = blocks[index - 1];
    // Linha em branco entre blocos, menos entre itens de lista seguidos.
    if (out.length > 0 && !(isList && previous && LIST_TYPES.has(previous.type))) out.push("");
    if (lines.length === 0 && !block.children?.length) {
      if (out[out.length - 1] === "") out.pop();
      return;
    }
    out.push(...lines.map((line) => indent + line));
    if (block.children?.length) {
      const nested = isList ? "  " : "";
      out.push(...renderBlocks(block.children, titleOf, indent + nested));
    }
  });
  return out;
}

/** Os blocos de uma página como texto Markdown. `titleOf` dá o título de uma página pelo id (menções e subpáginas). */
export function blocksToMarkdown(
  blocks: readonly MdBlock[],
  titleOf: (id: string) => string | null = () => null,
): string {
  const text = renderBlocks(blocks, titleOf, "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return text === "" ? "" : `${text}\n`;
}

// ───────────────────────── Importar ─────────────────────────

const isHttp = (url: string) => /^https?:\/\/\S+$/i.test(url);

const textRun = (text: string, styles: Record<string, boolean> = {}): InlineText => ({
  type: "text",
  text,
  styles,
});

/** Converte o Markdown de uma linha em conteúdo em linha: `**negrito**`, `*itálico*`, `~~riscado~~`, `` `código` `` e links. */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer !== "") out.push(textRun(buffer));
    buffer = "";
  };
  // `boundary`: marcas com sublinhado só valem nas bordas de palavra ("snake_case" não vira itálico).
  const rules: Array<{
    pattern: RegExp;
    boundary?: boolean;
    build: (m: RegExpExecArray) => Inline[] | null;
  }> = [
    { pattern: /^`([^`]+)`/, build: (m) => [textRun(m[1]!, { code: true })] },
    {
      pattern: /^\[([^\]]+)\]\(([^)\s]+)\)/,
      build: (m) =>
        isHttp(m[2]!) ? [{ type: "link", href: m[2]!, content: [textRun(m[1]!)] }] : null,
    },
    // O fechamento de `**` e `*` não pode ser seguido de outra estrela: em `***x***` as estrelas de fora fecham por último.
    {
      pattern: /^\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*(?!\*)/,
      build: (m) => parseInline(m[1]!).map((i) => withStyle(i, "bold")),
    },
    {
      pattern: /^__(?=\S)([\s\S]+?)(?<=\S)__(?!\w)/,
      boundary: true,
      build: (m) => parseInline(m[1]!).map((i) => withStyle(i, "bold")),
    },
    {
      pattern: /^~~(?=\S)([\s\S]+?)(?<=\S)~~/,
      build: (m) => parseInline(m[1]!).map((i) => withStyle(i, "strike")),
    },
    {
      pattern: /^\*(?=\S)([\s\S]+?)(?<=\S)\*(?!\*)/,
      build: (m) => parseInline(m[1]!).map((i) => withStyle(i, "italic")),
    },
    {
      pattern: /^_(?=\S)([\s\S]+?)(?<=\S)_(?!\w)/,
      boundary: true,
      build: (m) => parseInline(m[1]!).map((i) => withStyle(i, "italic")),
    },
  ];
  let rest = source;
  while (rest !== "") {
    if (rest[0] === "\\" && rest.length > 1) {
      buffer += rest[1];
      rest = rest.slice(2);
      continue;
    }
    let matched = false;
    const previous = source[source.length - rest.length - 1] ?? "";
    for (const { pattern, boundary, build } of rules) {
      if (boundary && /\w/.test(previous)) continue;
      const m = pattern.exec(rest);
      const built = m ? build(m) : null;
      if (m && built) {
        flush();
        out.push(...built);
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      buffer += rest[0];
      rest = rest.slice(1);
    }
  }
  flush();
  return out;
}

function withStyle(item: Inline, style: string): Inline {
  return item.type === "text"
    ? { ...item, styles: { ...item.styles, [style]: true } }
    : {
        ...item,
        content: item.content.map((c) => ({ ...c, styles: { ...c.styles, [style]: true } })),
      };
}

const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const NUMBERED = /^(\s*)\d+[.)]\s+(.*)$/;
const CHECK = /^\[( |x|X)\]\s+(.*)$/;
const FENCE = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/;
const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const indentOf = (line: string) => line.replace(/\t/g, "  ").match(/^ */)![0].length;

/** Divide uma linha de tabela em células, respeitando `\|`. */
function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, "|").trim());
}

interface Item {
  indent: number;
  block: MdBlock;
}

/** Converte Markdown em blocos do editor (sem ids: o editor os cria). */
export function markdownToBlocks(markdown: string): MdBlock[] {
  const lines = markdown.slice(0, MAX_IMPORT_CHARS).replace(/\r\n?/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  const stack: Item[] = []; // itens de lista abertos, para aninhar pela indentação
  let paragraph: string[] = [];

  const push = (block: MdBlock) => {
    stack.length = 0;
    blocks.push(block);
  };
  const flushParagraph = () => {
    if (paragraph.length > 0) {
      push({ type: "paragraph", content: parseInline(paragraph.join(" ")), children: [] });
      paragraph = [];
    }
  };
  const pushItem = (indent: number, block: MdBlock) => {
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) parent.block.children!.push(block);
    else blocks.push(block);
    stack.push({ indent, block });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    const fence = FENCE.exec(line);
    if (fence) {
      flushParagraph();
      const code: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${fence[1]}\\s*$`).test(lines[i]!))
        code.push(lines[i++]!);
      push({
        type: "codeBlock",
        props: { language: fence[2] || "text" },
        content: [textRun(code.join("\n"))],
        children: [],
      });
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      stack.length = 0;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      flushParagraph();
      push({
        type: "heading",
        props: { level: Math.min(3, heading[1]!.length) },
        content: parseInline(heading[2]!),
        children: [],
      });
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushParagraph(); // linha horizontal: separa blocos, sem bloco próprio
      stack.length = 0;
      continue;
    }

    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      push({ type: "quote", content: parseInline(quote[1]!), children: [] });
      continue;
    }

    const image = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line);
    if (image && isHttp(image[2]!)) {
      flushParagraph();
      push({ type: "image", props: { url: image[2]!, caption: image[1]! }, children: [] });
      continue;
    }

    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1]!)) {
      flushParagraph();
      const rows = [splitRow(line)];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i]!)) rows.push(splitRow(lines[i++]!));
      i--;
      push({
        type: "table",
        content: {
          type: "tableContent",
          rows: rows.map((cells) => ({ cells: cells.map((cell) => parseInline(cell)) })),
        },
        children: [],
      });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const match = (bullet ?? numbered)!;
      const indent = indentOf(match[1]!);
      const rest = match[2]!;
      const check = bullet ? CHECK.exec(rest) : null;
      if (check) {
        pushItem(indent, {
          type: "checkListItem",
          props: { checked: check[1] !== " " },
          content: parseInline(check[2]!),
          children: [],
        });
      } else {
        pushItem(indent, {
          type: bullet ? "bulletListItem" : "numberedListItem",
          content: parseInline(rest),
          children: [],
        });
      }
      continue;
    }

    paragraph.push(line.trim());
  }
  flushParagraph();
  return blocks;
}

/** O título de uma página importada: o primeiro título `#` (que então sai do texto), ou o nome do arquivo sem extensão. */
export function splitImportedTitle(
  blocks: MdBlock[],
  fileName: string,
): { title: string; blocks: MdBlock[] } {
  const first = blocks[0];
  if (first?.type === "heading" && (first.props?.level ?? 1) === 1) {
    const title = plainText(first.content).trim();
    if (title !== "") return { title: title.slice(0, 200), blocks: blocks.slice(1) };
  }
  const fromFile = fileName.replace(/\.(md|markdown|txt)$/i, "").trim();
  return { title: (fromFile || "Importado").slice(0, 200), blocks };
}

/** Uma tabela Markdown a partir de títulos de coluna e linhas de texto (usada para exportar uma base de dados). */
export function tableToMarkdownText(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
  const line = (cells: readonly string[]) => `| ${cells.map(cell).join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}
