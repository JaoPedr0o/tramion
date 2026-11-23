import { normalizeHttpUrl } from "./embeds.ts";

/**
 * A capa de uma página, guardada como texto: `color:#rrggbb`, `gradient:<nome>` ou `image:<endereço>`.
 * O Rust confere o formato ao gravar; aqui se monta e se lê, e se gera o estilo da tela de forma segura.
 */

export interface CoverGradient {
  readonly id: string;
  readonly label: string;
  readonly css: string;
}

/** Galeria de degradês (os nomes são os que o Rust aceita: letras minúsculas, números e hífen). */
export const COVER_GRADIENTS: readonly CoverGradient[] = [
  { id: "aurora", label: "Aurora", css: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)" },
  {
    id: "por-do-sol",
    label: "Pôr do sol",
    css: "linear-gradient(135deg, #ff9a9e 0%, #fad0c4 50%, #fbc2eb 100%)",
  },
  { id: "oceano", label: "Oceano", css: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
  { id: "floresta", label: "Floresta", css: "linear-gradient(135deg, #5ee7df 0%, #b490ca 100%)" },
  { id: "lavanda", label: "Lavanda", css: "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)" },
  { id: "pessego", label: "Pêssego", css: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)" },
  { id: "menta", label: "Menta", css: "linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)" },
  { id: "ardosia", label: "Ardósia", css: "linear-gradient(135deg, #434343 0%, #7a8590 100%)" },
];

/** Cores lisas da galeria. */
export const COVER_COLORS: ReadonlyArray<{ readonly hex: string; readonly label: string }> = [
  { hex: "#e03e3e", label: "Vermelho" },
  { hex: "#d9730d", label: "Laranja" },
  { hex: "#dfab01", label: "Amarelo" },
  { hex: "#0f7b6c", label: "Verde" },
  { hex: "#0b6e99", label: "Azul" },
  { hex: "#6940a5", label: "Roxo" },
  { hex: "#ad1a72", label: "Rosa" },
  { hex: "#64473a", label: "Marrom" },
  { hex: "#787774", label: "Cinza" },
];

export type ParsedCover =
  | { readonly kind: "color"; readonly hex: string }
  | { readonly kind: "gradient"; readonly id: string }
  | { readonly kind: "image"; readonly url: string };

export const coverOf = {
  color: (hex: string) => `color:${hex.toLowerCase()}`,
  gradient: (id: string) => `gradient:${id}`,
  image: (url: string) => `image:${url}`,
};

/** Lê o texto guardado. Formato desconhecido (por exemplo, de uma versão futura) vira `null`: sem capa. */
export function parseCover(cover: string | null): ParsedCover | null {
  if (cover === null) return null;
  if (/^color:#[0-9a-f]{6}$/i.test(cover)) return { kind: "color", hex: cover.slice(6) };
  if (/^gradient:[a-z0-9-]{1,32}$/.test(cover)) return { kind: "gradient", id: cover.slice(9) };
  if (cover.startsWith("image:") && cover.length > 6) return { kind: "image", url: cover.slice(6) };
  return null;
}

/** Fundo de reserva quando o nome do degradê não existe na galeria (versão futura, por exemplo). */
const FALLBACK_BACKGROUND = "linear-gradient(135deg, #e0e0e0 0%, #bdbdbd 100%)";

/** Os caracteres que poderiam "fechar" o `url("...")` do estilo são codificados (defesa extra; o Rust já os recusa). */
const cssSafe = (url: string) => url.replace(/["'\\()\s<>]/g, (char) => encodeURIComponent(char));

/** Estilo da faixa da capa, ou `null` se a página não tem capa. */
export function coverStyle(cover: string | null): Record<string, string> | null {
  const parsed = parseCover(cover);
  if (!parsed) return null;
  switch (parsed.kind) {
    case "color":
      return { backgroundColor: parsed.hex };
    case "gradient":
      return {
        backgroundImage:
          COVER_GRADIENTS.find((g) => g.id === parsed.id)?.css ?? FALLBACK_BACKGROUND,
      };
    case "image":
      return {
        backgroundImage: `url("${cssSafe(parsed.url)}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
  }
}

/** Endereço digitado para uma capa em imagem: só http e https. */
export function coverImageFromLink(text: string): string | null {
  const url = normalizeHttpUrl(text);
  return url ? coverOf.image(url) : null;
}
