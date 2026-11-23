import { describe, expect, it } from "vitest";
import { detectLanguage } from "./language-detect.ts";

const SAMPLES: Array<[string, string, string]> = [
  [
    "python",
    "python",
    `def somar(a, b):
    resultado = a + b
    print(f"soma: {resultado}")
    return resultado

class Calculadora:
    def __init__(self):
        self.historico = []`,
  ],
  [
    "javascript",
    "javascript",
    `const somar = (a, b) => {
  const resultado = a + b;
  console.log(resultado);
  return resultado;
};
document.addEventListener("click", () => somar(1, 2));`,
  ],
  [
    "typescript",
    "typescript",
    `interface Usuario {
  id: number;
  nome: string;
}
export function ola(usuario: Usuario): string {
  return \`Olá, \${usuario.nome}\`;
}`,
  ],
  [
    "sql",
    "sql",
    `SELECT u.nome, COUNT(p.id) AS total
FROM usuarios u
LEFT JOIN pedidos p ON p.usuario_id = u.id
WHERE u.ativo = 1
GROUP BY u.nome
ORDER BY total DESC;`,
  ],
  [
    "rust",
    "rust",
    `fn main() {
    let numeros = vec![1, 2, 3];
    for n in &numeros {
        println!("{}", n);
    }
}`,
  ],
  [
    "java",
    "java",
    `public class Ola {
    public static void main(String[] args) {
        System.out.println("Olá");
    }
}`,
  ],
  [
    "css",
    "css",
    `.cartao {
  display: flex;
  padding: 16px;
  background-color: #fff;
  border-radius: 4px;
}`,
  ],
  [
    "php",
    "php",
    `<?php
function ola($nome) {
    echo "Olá, " . $nome;
}
ola("mundo");`,
  ],
  [
    "yaml",
    "yaml",
    `nome: projeto
versao: 1.0.0
dependencias:
  - react
  - vite
scripts:
  build: vite build`,
  ],
];

describe("detecção de linguagem ao colar", () => {
  it.each(SAMPLES)("reconhece %s", (_name, expected, code) => {
    expect(detectLanguage(code)).toBe(expected);
  });

  it("reconhece JSON válido (objeto e lista)", () => {
    expect(detectLanguage('{"nome": "Ana", "idade": 30, "ativo": true}')).toBe("json");
    expect(detectLanguage('[1, 2, 3, {"a": "b"}]')).toBe("json");
  });

  it("reconhece shell pela primeira linha (shebang) e por comandos", () => {
    expect(detectLanguage("#!/bin/bash\necho 'oi'\nls -la")).toBe("shellscript");
    expect(detectLanguage("#!/usr/bin/env python3\nprint('oi')")).toBe("python");
  });

  it("reconhece HTML pelo início do documento", () => {
    expect(detectLanguage("<!DOCTYPE html>\n<html><body><p>oi</p></body></html>")).toBe("html");
    expect(detectLanguage('<html lang="pt"><head></head></html>')).toBe("html");
  });

  it("reconhece XML pela declaração", () => {
    expect(detectLanguage('<?xml version="1.0"?><raiz><item/></raiz>')).toBe("xml");
  });

  it("não chuta: texto comum e trechos curtos viram `null`", () => {
    expect(detectLanguage("")).toBeNull();
    expect(detectLanguage("oi")).toBeNull();
    expect(detectLanguage("   ")).toBeNull();
    expect(
      detectLanguage("Esta é uma frase comum escrita em português, sem nenhum código aqui."),
    ).toBeNull();
    expect(detectLanguage("lista de compras: pão, leite, ovos e café")).toBeNull();
  });

  it("JSON inválido não é tratado como JSON", () => {
    expect(detectLanguage('{"quebrado": ')).not.toBe("json");
  });

  it("só devolve linguagens que o bloco de código do editor sabe colorir", () => {
    const known = new Set([
      "shellscript",
      "c",
      "cpp",
      "csharp",
      "css",
      "graphql",
      "haskell",
      "java",
      "javascript",
      "json",
      "julia",
      "kotlin",
      "less",
      "lua",
      "markdown",
      "php",
      "python",
      "r",
      "ruby",
      "rust",
      "scala",
      "scss",
      "sql",
      "swift",
      "typescript",
      "html",
      "xml",
      "yaml",
    ]);
    for (const [, , code] of SAMPLES) {
      const detected = detectLanguage(code);
      expect(detected === null || known.has(detected)).toBe(true);
    }
  });
});
