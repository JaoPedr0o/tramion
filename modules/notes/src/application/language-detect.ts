import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import graphql from "highlight.js/lib/languages/graphql";
import haskell from "highlight.js/lib/languages/haskell";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import julia from "highlight.js/lib/languages/julia";
import kotlin from "highlight.js/lib/languages/kotlin";
import less from "highlight.js/lib/languages/less";
import lua from "highlight.js/lib/languages/lua";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scala from "highlight.js/lib/languages/scala";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

/**
 * Descobre a linguagem de um trecho de código colado. Usa só as linguagens que o bloco de código do
 * editor sabe colorir (para o resultado sempre existir na lista) e as registra uma a uma, em vez de
 * carregar a biblioteca inteira.
 */

/** Nome na biblioteca de detecção → identificador no bloco de código do editor. */
const TO_EDITOR_LANGUAGE: Record<string, string> = {
  bash: "shellscript",
  c: "c",
  cpp: "cpp",
  csharp: "csharp",
  css: "css",
  graphql: "graphql",
  haskell: "haskell",
  java: "java",
  javascript: "javascript",
  json: "json",
  julia: "julia",
  kotlin: "kotlin",
  less: "less",
  lua: "lua",
  markdown: "markdown",
  php: "php",
  python: "python",
  r: "r",
  ruby: "ruby",
  rust: "rust",
  scala: "scala",
  scss: "scss",
  sql: "sql",
  swift: "swift",
  typescript: "typescript",
  xml: "html",
  yaml: "yaml",
};

const REGISTERED = {
  bash,
  c,
  cpp,
  csharp,
  css,
  graphql,
  haskell,
  java,
  javascript,
  json,
  julia,
  kotlin,
  less,
  lua,
  markdown,
  php,
  python,
  r,
  ruby,
  rust,
  scala,
  scss,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};
for (const [name, definition] of Object.entries(REGISTERED))
  hljs.registerLanguage(name, definition);
const CANDIDATES = Object.keys(REGISTERED);

/** Abaixo disto, a detecção "acha" qualquer coisa: é melhor não chutar. */
const MIN_RELEVANCE = 7;
const MIN_LENGTH = 12;

/**
 * Sinais característicos de linguagens que a estatística confunde em trechos curtos (Java e C#, por exemplo)
 * ou não reconhece (YAML, que é só "chave: valor" e listas). Só dispara com sinais fortes.
 */
function detectByKeywords(text: string): string | null {
  if (/\bSystem\.out\.print|public\s+static\s+void\s+main\s*\(\s*String/.test(text)) return "java";
  if (/\bConsole\.Write(?:Line)?\(|^\s*using\s+System\b|\bnamespace\s+\w+/m.test(text))
    return "csharp";

  const rustFunction = /\bfn\s+\w+\s*\([^)]*\)\s*(?:->\s*[\w<>&[\]]+\s*)?\{/.test(text);
  if (rustFunction && /\blet\s+(?:mut\s+)?\w+|println!|use\s+std::|\bimpl\b/.test(text))
    return "rust";

  // YAML: quase todas as linhas são "chave: valor" ou "- item", e não há símbolos de código.
  const lines = text
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));
  if (lines.length >= 3 && !/[{};()=]/.test(text)) {
    const yamlLike = lines.filter((line) =>
      /^\s*(?:-\s+\S.*|[A-Za-z_][\w.-]*:(?:\s+.*)?)$/.test(line),
    );
    if (yamlLike.length / lines.length >= 0.8) return "yaml";
  }
  return null;
}

/** Linguagem do trecho (no vocabulário do bloco de código), ou `null` se não houver confiança. */
export function detectLanguage(code: string): string | null {
  const text = code.trim();
  if (text.length < MIN_LENGTH) return null;

  // Sinais inequívocos, mais confiáveis do que a estatística.
  const firstLine = text.split("\n", 1)[0]!;
  if (/^#!.*\b(?:ba|z|da)?sh\b/.test(firstLine)) return "shellscript";
  if (/^#!.*\bpython/.test(firstLine)) return "python";
  if (/^<!doctype html|^<html[\s>]/i.test(text)) return "html";
  if (/^<\?xml/i.test(text)) return "xml";
  if (/^[{[]/.test(text)) {
    try {
      JSON.parse(text);
      return "json";
    } catch {
      /* não é JSON válido: segue para a detecção geral */
    }
  }

  const byKeyword = detectByKeywords(text);
  if (byKeyword) return byKeyword;

  const result = hljs.highlightAuto(text, CANDIDATES);
  if (!result.language || result.relevance < MIN_RELEVANCE) return null;
  return TO_EDITOR_LANGUAGE[result.language] ?? null;
}
