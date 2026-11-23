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
pnpm --filter @tramion/desktop tauri dev
```

A primeira compilação do Rust é demorada e gera vários GB em `apps/desktop/src-tauri/target/`.
Essa pasta pode ser apagada a qualquer momento; ela é regenerada.

Em máquinas com NVIDIA dentro de container pode aparecer `libEGL warning`. O WebKit cai para
renderização por software e o app funciona normalmente.

## Testes e verificações

```bash
pnpm check        # tudo: lint + formatação + tipos + testes + verificações do Rust
pnpm lint         # ESLint, inclui as fronteiras de arquitetura
pnpm format       # aplica o Prettier
pnpm typecheck    # TypeScript em todos os pacotes
pnpm test         # Vitest (inclui testes de interface com jsdom)
pnpm check:rust   # rustfmt + clippy + cargo test (precisa do cargo no PATH: `. ~/.cargo/env`)
```

`rustfmt` e `clippy` não vêm no perfil mínimo do rustup: `rustup component add rustfmt clippy`.

## Criar um novo módulo

O módulo `modules/notes` é o exemplo de referência. Um módulo é uma fatia vertical:

**Lado TypeScript** (`modules/<nome>/`):

1. `package.json` com `name: "@tramion/<nome>"`, `main` e `exports` apontando para `src/index.ts`, e dependências
   `workspace:*` apenas de `@tramion/contracts`, `@tramion/core` e `@tramion/ui`. O lint recusa qualquer outro módulo.
2. `src/index.ts` exporta a função que cria o `ModuleManifest` (`id`, `version`, `dependsOn`, `register`).
3. No `register`, o módulo registra suas telas em `views` e assina/publica eventos em `events`.
4. Camadas: `domain/` (tipos), `application/` (casos de uso e a interface do gateway),
   `infrastructure/` (adaptador que chama o Rust), `ui/` (React).
5. Eventos novos entram em `AppEvents` no pacote `@tramion/contracts`.

**Lado Rust** (`modules/<nome>/rust/`, crate `tramion-<nome>`):

1. `Cargo.toml` com `links = "tauri-plugin-<nome>"`, e `build.rs` listando os comandos
   (`tauri_plugin::Builder::new(COMMANDS).build()`).
2. `migrations/NNNN_*.sql` (versões 1, 2, 3... sem buracos; **nunca edite uma migração já aplicada**).
3. `src/lib.rs` expõe `MIGRATIONS` (um `ModuleMigrations`) e `init()` (o plugin do Tauri).
4. `permissions/default.toml` define o conjunto padrão de permissões do módulo.

**Ligar ao app** (as duas únicas linhas que conhecem o módulo):

- `apps/desktop/src/bootstrap.ts`: `registry.add(createXModule())`.
- `apps/desktop/src-tauri/src/lib.rs`: `.plugin(tramion_x::init())` e incluir `tramion_x::MIGRATIONS` na lista.
- `apps/desktop/src-tauri/capabilities/default.json`: habilitar `"<nome>:default"`.
- Dependência do crate no `Cargo.toml` do `src-tauri` e do pacote no `package.json` do app.

Rode `pnpm install` e `pnpm check`.

## Dados locais

O app grava em `~/.local/share/dev.tramion.app/` (banco `tramion.db` e pasta `backups/`).
Em desenvolvimento, apagar essa pasta recria o banco do zero.

## Instalar no computador (Linux, via contêiner)

Dentro do contêiner `aun`, a partir de `apps/desktop`:

```sh
pnpm tauri build --bundles deb        # gera o pacote em target/release/bundle/deb/
sudo dpkg -i ../../target/release/bundle/deb/Tramion_*_amd64.deb
distrobox-export --app tramion   # cria o atalho no menu de aplicativos do sistema
```

Para atualizar, repita os dois primeiros comandos (o atalho continua valendo). Para remover: `distrobox-export --app
tramion --delete` e `sudo apt remove tramion`. Os dados em `~/.local/share/dev.tramion.app/` não
são apagados. Ver o ADR 0015.

## Núcleo (`@tramion/core`)

- `createEventBus<E>()`: barramento tipado e síncrono (ADR 0007).
- `createModuleRegistry({ events })`: `add(manifest)` e `start()`, que registra os módulos pela ordem de
  `dependsOn`. Valida tudo antes de iniciar: ou sobe tudo, ou nada começa.
- `AppError`: erro com `code` estável e `cause` preservada.
