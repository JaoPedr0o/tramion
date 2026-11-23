# 0014. Bases de dados (tabela)

**Status:** Aceita (fase 1: modelo e visão em tabela)

## Contexto

Para ser parecido com o Notion, o app precisa de bases de dados: coleções de páginas com colunas tipadas e
várias formas de ver os dados.

## Decisões

1. **Uma base é uma página marcada** (`notes_database`); as **linhas são as subpáginas diretas**. Assim cada linha abre
   como página normal (texto, blocos, ícone, capa), vai para a lixeira, volta e é movida pelas mesmas regras de sempre.
2. **Colunas** (`notes_property`) têm tipo fixo depois de criadas: texto, número, seleção, seleção múltipla, data,
   caixa de seleção e link. O **título da linha não é coluna**: é o da própria página.
3. **Células** (`notes_cell`) guardam um JSON por (linha, coluna). **Célula vazia não existe**: texto vazio, lista
   vazia e `null` apagam a linha da tabela.
4. **Quem valida é o Rust**: o valor precisa servir ao tipo (número finito; data `AAAA-MM-DD` que existe no
   calendário, com bissexto; link só http/https; seleção só com ids de opções da coluna; sem repetição), e a linha
   precisa ser filha direta de uma base **ativa**. Limites: 50 colunas, 50 opções por coluna, 100 caracteres no nome.
5. **Opções de seleção** guardam `id`, `nome` e `cor`. A célula guarda o **id**: renomear uma opção não perde dados.
   Remover uma opção limpa as células que a usavam, na mesma transação.
6. **Excluir de vez** uma base leva colunas e células (`ON DELETE CASCADE`). Mover uma linha para fora da base
   deixa as células órfãs de coluna; elas não aparecem e são apagadas se a linha for excluída de vez.
7. **Filtro e ordenação ficam no cliente** (funções puras testadas) e **ainda não são salvos**: valem enquanto a
   base está aberta. Filtros combinam com E; vazios ficam sempre no fim da ordenação.
8. **Listas suspensas próprias** (`Choice`) no lugar do `<select>` nativo: a lista nativa não abre de forma confiável
   em todos os webviews. As janelinhas ancoradas (`Popover` com `anchor`) são desenhadas em `document.body` para
   não serem cortadas pela rolagem da tabela.

## Limites conhecidos (fase 1)

- Só a visão em **tabela**; quadro, lista, galeria e calendário vêm depois.
- Filtros e ordenação não persistem; não há várias visões salvas.
- Sem coluna de relação, fórmula, pessoa ou arquivo; sem reordenar colunas; sem ícone/capa na própria base.
- Mudar o tipo de uma coluna não é permitido (apague e crie outra).
