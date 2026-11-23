/**
 * Links e vídeos incorporados na página. Tudo aqui é puro e defensivo: o que o usuário cola é entrada
 * não confiável, e só `http`/`https` e provedores conhecidos passam.
 */

/**
 * Endereço http(s) válido, ou `null`. Sem esquema ("exemplo.com/a"), assume `https://`. Recusa `javascript:`,
 * `file:`, `data:` e tudo que não seja http(s), além de texto com espaços ou sem domínio.
 */
export function normalizeHttpUrl(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "" || /\s/.test(trimmed)) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Domínio para mostrar no cartão (sem "www."). */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export interface VideoEmbed {
  readonly provider: "youtube" | "vimeo";
  readonly embedUrl: string;
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Transforma um link do YouTube ou do Vimeo no endereço de incorporação, ou `null` se não for de um deles.
 * O domínio é comparado POR IGUALDADE (não por "termina com"): `youtube.com.malicioso.com` não passa.
 * O identificador é conferido, então o endereço montado nunca carrega nada além dele.
 */
export function videoEmbed(link: string): VideoEmbed | null {
  const normalized = normalizeHttpUrl(link);
  if (!normalized) return null;
  const url = new URL(normalized);
  const host = url.hostname.toLowerCase();

  let youtubeId: string | null = null;
  if (YOUTUBE_HOSTS.has(host)) {
    const fromQuery = url.searchParams.get("v");
    const fromPath = /^\/(?:shorts|embed|live)\/([^/?#]+)/.exec(url.pathname)?.[1];
    youtubeId = url.pathname === "/watch" ? fromQuery : (fromPath ?? null);
  } else if (host === "youtu.be") {
    youtubeId = url.pathname.slice(1).split("/")[0] ?? null;
  }
  if (youtubeId !== null && YOUTUBE_ID.test(youtubeId)) {
    return { provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}` };
  }

  if (host === "vimeo.com" || host === "www.vimeo.com" || host === "player.vimeo.com") {
    const id = /^\/(?:video\/)?(\d{5,})(?:\/|$)/.exec(url.pathname)?.[1];
    if (id) return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
  }
  return null;
}
