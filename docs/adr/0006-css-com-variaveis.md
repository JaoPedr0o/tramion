# 0006. Estilo: CSS com variáveis (tokens)

**Status:** Aceita

## Contexto

É preciso um sistema de design consistente, com temas claro e escuro e personalização futura.

## Decisão

CSS puro com variáveis em `apps/desktop/src/styles/tokens.css` (cores, espaçamentos, tipografia).
Alternativa considerada: Tailwind, descartada por ora para não adicionar dependência e porque trocar
tema ou personalizar equivale, aqui, a trocar variáveis.

## Consequências

- Componentes usam `var(--...)`; valores soltos são proibidos por convenção.
- Quando existir `packages/ui`, os tokens migram para lá.
