import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Testes ficam junto do código (*.test.ts) e, para cruzar módulos, em tests/.
    include: ["{packages,modules,apps}/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    passWithNoTests: true,
  },
});
