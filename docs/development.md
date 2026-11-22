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

_Será documentado na etapa 3, quando o contrato de módulo existir._
