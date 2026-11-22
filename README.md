# Aesthetic Ugly Notes

Aplicativo desktop **local-first** de organização pessoal: notas, páginas, tarefas e bancos de dados
personalizados, construído sobre uma arquitetura **modular** e extensível.

- Funciona 100% offline, sem cadastro, login ou servidor.
- Dados guardados localmente em SQLite.
- Cada funcionalidade é um módulo independente, com limites verificados por ferramenta.

> Status: **etapa 5a (fatia mínima do módulo de notas)**: o app abre o banco, aplica a migração do
> módulo e exibe a tela de Notas (ainda vazia). Próximo: CRUD completo.

## Documentação

| Documento                                    | Conteúdo                                          |
| -------------------------------------------- | ------------------------------------------------- |
| [docs/product.md](docs/product.md)           | Visão do produto e do que está fora de escopo     |
| [docs/architecture.md](docs/architecture.md) | Arquitetura, estrutura de diretórios e fronteiras |
| [docs/development.md](docs/development.md)   | Como executar, testar e criar módulos             |
| [docs/conventions.md](docs/conventions.md)   | Convenções de código                              |
| [docs/adr/](docs/adr/)                       | Decisões arquiteturais registradas (ADRs)         |

## Início rápido

Veja [docs/development.md](docs/development.md) para pré-requisitos (Rust, Node, pnpm e bibliotecas do Tauri).

```bash
pnpm install
pnpm --filter @aun/desktop tauri dev   # abre o app
pnpm check                             # lint + formatação + tipos + testes
```
