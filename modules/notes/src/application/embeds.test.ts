import { describe, expect, it } from "vitest";
import { hostnameOf, normalizeHttpUrl, videoEmbed } from "./embeds.ts";

describe("normalizeHttpUrl", () => {
  it("aceita http e https", () => {
    expect(normalizeHttpUrl("https://exemplo.com/a?b=1#c")).toBe("https://exemplo.com/a?b=1#c");
    expect(normalizeHttpUrl("http://exemplo.com")).toBe("http://exemplo.com/");
    expect(normalizeHttpUrl("  https://exemplo.com  ")).toBe("https://exemplo.com/");
  });

  it("sem esquema, assume https", () => {
    expect(normalizeHttpUrl("exemplo.com/pagina")).toBe("https://exemplo.com/pagina");
    expect(normalizeHttpUrl("www.exemplo.com")).toBe("https://www.exemplo.com/");
  });

  it("um endereço começando com // é tratado como https (inofensivo)", () => {
    expect(normalizeHttpUrl("//exemplo.com")).toBe("https://exemplo.com/");
  });

  it("aceita localhost", () => {
    expect(normalizeHttpUrl("http://localhost:3000/x")).toBe("http://localhost:3000/x");
  });

  it.each([
    "",
    "   ",
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "file:///etc/passwd",
    "data:text/html,<script>1</script>",
    "ftp://exemplo.com",
    "mailto:a@b.com",
    "vbscript:x",
    "https://exe mplo.com",
    "duas palavras",
    "semdominio",
    "https://",
  ])("recusa %j", (input) => {
    expect(normalizeHttpUrl(input)).toBeNull();
  });
});

describe("hostnameOf", () => {
  it("devolve o domínio sem 'www.'", () => {
    expect(hostnameOf("https://www.exemplo.com/a/b")).toBe("exemplo.com");
    expect(hostnameOf("https://sub.exemplo.com")).toBe("sub.exemplo.com");
  });

  it("com texto que não é endereço, devolve o próprio texto", () => {
    expect(hostnameOf("isto não é url")).toBe("isto não é url");
  });
});

describe("videoEmbed", () => {
  const YT = (id: string) => `https://www.youtube-nocookie.com/embed/${id}`;

  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("YouTube: %s", (link, id) => {
    expect(videoEmbed(link)).toEqual({ provider: "youtube", embedUrl: YT(id) });
  });

  it.each([
    ["https://vimeo.com/76979871", "76979871"],
    ["https://www.vimeo.com/76979871", "76979871"],
    ["https://player.vimeo.com/video/76979871", "76979871"],
    ["https://vimeo.com/76979871/abcdef123", "76979871"],
  ])("Vimeo: %s", (link, id) => {
    expect(videoEmbed(link)).toEqual({
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${id}`,
    });
  });

  it("usa sempre o domínio sem rastreadores do YouTube", () => {
    expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ")?.embedUrl).toContain("youtube-nocookie.com");
  });

  it.each([
    "https://youtube.com.malicioso.com/watch?v=dQw4w9WgXcQ", // domínio que só COMEÇA parecido
    "https://malicioso.com/youtube.com/watch?v=dQw4w9WgXcQ",
    "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be.malicioso.com/dQw4w9WgXcQ",
    "https://vimeo.com.malicioso.com/76979871",
    "https://www.youtube.com/watch", // sem o identificador
    "https://www.youtube.com/watch?v=curto", // identificador inválido
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ"onload="x', // tentativa de injeção
    "https://www.youtube.com/watch?v=../../outro",
    "https://www.youtube.com/channel/UC123",
    "https://vimeo.com/abc",
    "https://vimeo.com/123", // curto demais para ser um vídeo
    "https://exemplo.com/video.mp4",
    "javascript:alert(1)",
    "",
  ])("recusa %j", (link) => {
    expect(videoEmbed(link)).toBeNull();
  });
});
