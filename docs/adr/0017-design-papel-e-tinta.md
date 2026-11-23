# 0017. Design "papel e tinta"

**Status:** Aceita. Substitui as decisões de identidade visual (itens 3 e 4) do [ADR 0015](0015-nome-identidade-visual-e-instalacao.md).

## Contexto

O primeiro design do Tramion (degradê índigo, lilás e coral, barra lateral em degradê, glow no logo) parecia enfeitado
demais para uma ferramenta de trabalho. O guia [unslop](https://github.com/heydamir/unslop) (Damir Sokolovsky, CC BY 4.0)
descreve como transformar uma interface com "cara de IA" em uma interface projetada: auditar, definir uma direção e
corrigir em passes ordenados. Seguimos esse processo e adaptamos as regras e os valores dele ao projeto.

## Direção

- **Produto:** notas e bases de dados para uso diário, local-first.
- **Caráter:** calmo, preciso, editorial.
- **Mundo:** papel e tinta. Claro em papel quente; escuro em grafite quente.
- **Momentos de cor:** só no conteúdo (capas, ícones de página, etiquetas de seleção das bases). A casca é neutra.
- **Assinatura:** um ponto de acento (o "íon" da marca) marca o que está ativo (página aberta na árvore, dia de hoje no
  calendário), sempre do mesmo jeito.

## Decisões (os nove passes)

1. **Espaçamento:** grade de 4 px (tokens `--space-*`, com 12 e 20 acrescentados), linhas de 32 px, lateral de 256 px e barra
   superior de 56 px.
2. **Cor:** rampa neutra quente nos dois temas, três papéis de texto (principal, secundário e mudo), hairlines a 9–10 % do
   texto e **um acento terracota** (`#b4492a` no claro, `#e8825f` no escuro). Sem degradês de matiz, brilhos nem sombras
   coloridas. Todos os pares de texto e fundo têm **contraste mínimo de 4,5:1** (conferido por cálculo; o "mudo" claro e o
   vermelho de perigo foram escurecidos em relação aos valores do guia por não passarem).
3. **Ícones:** sem mudança (um único conjunto, 16 px, traço 1,5). Emoji só como conteúdo escolhido pela pessoa.
4. **Texto:** sem saudações nem exclamações. O guia de boas-vindas passou a se chamar "Guia rápido". Meses e dias da
   semana em minúsculas ou com inicial maiúscula conforme o português (sem `text-transform`).
5. **Tipografia:** Inter para a interface; **Fraunces só nos títulos grandes** (título da página, da base e tela inicial).
   Pesos 400 e 500; 600 apenas nos títulos dentro da página.
6. **Layout:** sem mudança de estrutura.
7. **Detalhes:** seleção é uma mudança de superfície neutra; citação com barra neutra; números com
   `tabular-nums`; itens do calendário com superfície e linha fina.
8. **Visuais:** marca **chapada** (grafite, papel e ponto terracota), sem degradê; capas dos exemplos em cores lisas.
9. **Movimento:** uma curva (`cubic-bezier(0.22, 1, 0.36, 1)`) e duas durações (150 e 200 ms). Foi removida a animação
   de largura da barra lateral (propriedade de layout).

## Limites conhecidos

- A galeria de capas continua com degradês pastel: é conteúdo escolhido pela pessoa, não a casca do app.
- A cor das etiquetas de seleção é conteúdo e continua colorida.
- O código do BlockNote (bloco de código) segue o tema escuro padrão dele nos dois temas.

## Crédito

Processo e valores de referência: **unslop**, de Damir Sokolovsky (@heydamir), licença
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), https://github.com/heydamir/unslop. Adaptado ao Tramion.
