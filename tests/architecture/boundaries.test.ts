import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Garante que as fronteiras de arquitetura (ADR 0004) realmente barram o que deveriam.
// Lição: uma regra de lint que nunca falhou não prova que funciona. Aqui, cada caso proibido
// PRECISA gerar erro, e cada caso permitido NÃO pode gerar.

const root = resolve(import.meta.dirname, "../..");
const eslint = new ESLint({ cwd: root });

/** Roda o ESLint num arquivo virtual e devolve as mensagens da regra de fronteiras. */
async function boundaryErrors(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: resolve(root, filePath) });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === "boundaries/dependencies")
    .map((m) => m.message);
}

describe("fronteiras de arquitetura", () => {
  it("permite ao core importar contracts pelo nome do pacote", async () => {
    expect(
      await boundaryErrors("packages/core/src/virtual.ts", 'import "@aun/contracts";'),
    ).toEqual([]);
  });

  it("permite imports relativos dentro do mesmo pacote", async () => {
    expect(await boundaryErrors("packages/core/src/virtual.ts", 'import "./errors.ts";')).toEqual(
      [],
    );
  });

  it("proíbe import relativo que sai do pacote", async () => {
    const errors = await boundaryErrors(
      "packages/core/src/virtual.ts",
      'import "../../contracts/src/index.ts";',
    );
    expect(errors).toHaveLength(1);
  });

  it("proíbe contracts de importar outro pacote do projeto", async () => {
    const errors = await boundaryErrors("packages/contracts/src/virtual.ts", 'import "@aun/core";');
    expect(errors).toHaveLength(1);
  });
});
