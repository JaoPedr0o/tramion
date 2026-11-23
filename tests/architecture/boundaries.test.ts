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
      await boundaryErrors("packages/core/src/virtual.ts", 'import "@tramion/contracts";'),
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
    const errors = await boundaryErrors(
      "packages/contracts/src/virtual.ts",
      'import "@tramion/core";',
    );
    expect(errors).toHaveLength(1);
  });

  it("proíbe também imports de SUBCAMINHO de pacote (@tramion/ui/tokens.css)", async () => {
    const errors = await boundaryErrors(
      "packages/core/src/virtual.ts",
      'import "@tramion/ui/tokens.css";',
    );
    expect(errors).toHaveLength(1);
  });

  it("permite subcaminho de um pacote que a regra libera", async () => {
    expect(
      await boundaryErrors("packages/core/src/virtual.ts", 'import "@tramion/contracts/algo";'),
    ).toEqual([]);
  });

  describe("módulos", () => {
    const file = "modules/notes/src/virtual.ts";

    it("proíbe um módulo de importar outro módulo", async () => {
      expect(await boundaryErrors(file, 'import "@tramion/tasks";')).toHaveLength(1);
    });

    it("proíbe QUALQUER outro módulo de importar o módulo de notas (pacote real)", async () => {
      // O alvo aqui é um pacote que existe de verdade (@tramion/notes), não um nome inventado.
      const other = "modules/outro/src/virtual.ts";
      expect(await boundaryErrors(other, 'import "@tramion/notes";')).toHaveLength(1);
    });

    it("proíbe o módulo Foco de importar o de notas, e o de notas de importar o Foco", async () => {
      expect(
        await boundaryErrors("modules/focus/src/virtual.ts", 'import "@tramion/notes";'),
      ).toHaveLength(1);
      expect(await boundaryErrors(file, 'import "@tramion/focus";')).toHaveLength(1);
    });

    it("proíbe um módulo de importar o app", async () => {
      expect(await boundaryErrors(file, 'import "@tramion/desktop";')).toHaveLength(1);
    });

    it("proíbe import relativo que sai do módulo para outro pacote", async () => {
      // O alvo precisa EXISTIR: caminho que não resolve não é classificado pelo plugin.
      const code = 'import "../../../packages/core/src/index.ts";';
      expect(await boundaryErrors(file, code)).toHaveLength(1);
    });

    it("permite ao módulo usar contracts, core e ui", async () => {
      const code = 'import "@tramion/contracts"; import "@tramion/core"; import "@tramion/ui";';
      expect(await boundaryErrors(file, code)).toEqual([]);
    });

    it("permite ao módulo importar os próprios arquivos", async () => {
      expect(await boundaryErrors(file, 'import "./module.ts";')).toEqual([]);
    });
  });
});
