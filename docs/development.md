# Desenvolvimento

## Ambiente usado

Ubuntu 24.04 dentro de um distrobox dedicado (ver [ADR 0005](adr/0005-ambiente-em-distrobox-dedicado.md)),
com Rust estável (rustup), Node 22, pnpm e as bibliotecas de sistema do Tauri.

Bibliotecas de sistema necessárias no Ubuntu/Debian:

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  libayatana-appindicator3-dev libssl-dev pkg-config build-essential curl file
```

## Executar

```bash
pnpm install
pnpm --filter @aun/desktop tauri dev
```

A primeira compilação do Rust é demorada e gera vários GB em `apps/desktop/src-tauri/target/`.
Essa pasta pode ser apagada a qualquer momento; ela é regenerada.

Em máquinas com NVIDIA dentro de container pode aparecer `libEGL warning`. O WebKit cai para
renderização por software e o app funciona normalmente.

## Testes e verificações

```bash
pnpm check        # tudo: lint + formatação + tipos + testes
pnpm lint         # ESLint, inclui as fronteiras de arquitetura
pnpm format       # aplica o Prettier
pnpm typecheck    # TypeScript em todos os pacotes
pnpm test         # Vitest
```

## Criar um novo módulo

1. Crie `modules/<nome>/` com `package.json` (`name: "@aun/<nome>"`, `main` e `exports` apontando para
   `src/index.ts`, dependências `workspace:*` só de `@aun/contracts`, `@aun/core` e `@aun/ui`).
2. Exporte em `src/index.ts` um `ModuleManifest` (`id`, `version`, `dependsOn`, `register`).
3. Se o módulo publica eventos, declare-os em `AppEvents` no pacote `@aun/contracts`.
4. No app, importe o manifesto pelo nome do pacote e cadastre-o com `registry.add(...)`.
5. Rode `pnpm install` e `pnpm check`. O lint recusa qualquer import de outro módulo.

_O primeiro módulo real (`notes`) chega na etapa 5 e servirá de exemplo._

## Núcleo (`@aun/core`)

- `createEventBus<E>()`: barramento tipado e síncrono (ADR 0007).
- `createModuleRegistry({ events })`: `add(manifest)` e `start()`, que registra os módulos pela ordem de
  `dependsOn`. Valida tudo antes de iniciar: ou sobe tudo, ou nada começa.
- `AppError`: erro com `code` estável e `cause` preservada.
