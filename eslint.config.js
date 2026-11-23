import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/target/**", "**/node_modules/**", "**/src-tauri/gen/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ["apps/**/*.{ts,tsx}", "modules/**/ui/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // ───────── Fronteiras de arquitetura (ver docs/architecture.md) ─────────
  {
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}", "modules/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "apps/*", capture: ["name"] },
        { type: "contracts", pattern: "packages/contracts" },
        { type: "core", pattern: "packages/core" },
        { type: "ui", pattern: "packages/ui" },
        { type: "infra", pattern: "packages/infra-*", capture: ["name"] },
        { type: "module", pattern: "modules/*", capture: ["name"] },
      ],
    },
    rules: {
      "boundaries/no-unknown-files": 2,
      "boundaries/dependencies": [
        2,
        {
          checkAllOrigins: true, // também confere imports por nome de pacote (@aesthetic/*)
          checkInternals: true,
          default: "allow",
          // Atenção: a ÚLTIMA política que casa vence.
          policies: [
            // 1) Entre pacotes do projeto, tudo é proibido por padrão...
            {
              disallow: { to: { module: { origin: "external", source: "@aesthetic/*" } } },
              message:
                "Dependência entre pacotes não permitida pela arquitetura (ver docs/architecture.md)",
            },
            // 2) ...e só liberamos o que a arquitetura permite.
            // contracts: nenhum pacote @aesthetic.
            {
              from: { element: { type: "core" } },
              allow: { to: { module: { source: "@aesthetic/contracts" } } },
            },
            {
              from: { element: { type: "ui" } },
              allow: { to: { module: { source: "@aesthetic/contracts" } } },
            },
            {
              from: { element: { type: "infra" } },
              allow: { to: { module: { source: ["@aesthetic/contracts", "@aesthetic/core"] } } },
            },
            // módulos: contracts, core e ui. NUNCA outro módulo.
            {
              from: { element: { type: "module" } },
              allow: {
                to: {
                  module: { source: ["@aesthetic/contracts", "@aesthetic/core", "@aesthetic/ui"] },
                },
              },
            },
            // app = composition root: liga tudo.
            {
              from: { element: { type: "app" } },
              allow: { to: { module: { source: "@aesthetic/*" } } },
            },
            // 3) Import RELATIVO que sai do próprio pacote é sempre proibido.
            //    Para cruzar a fronteira, use o nome do pacote.
            {
              disallow: {
                to: { module: { origin: "local" }, element: { path: "!{{ from.element.path }}" } },
              },
              message:
                "Não importe arquivos de outro pacote por caminho relativo; use o nome do pacote.",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
