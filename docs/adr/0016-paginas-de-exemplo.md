# 0016. Páginas de exemplo na primeira abertura

**Status:** Aceita

## Contexto

Um app de notas vazio não mostra o que sabe fazer. O Notion abre com páginas de exemplo; o Tramion também.

## Decisões

1. **Quatro exemplos:** "Comece por aqui" (guia com tarefas, atalhos e explicação das bases), "Lista de tarefas" e
   "Leituras" (bases de dados com colunas de seleção, data e número e linhas preenchidas) e "Diário". Os prazos da lista
   de tarefas são calculados a partir de hoje, para sempre parecerem atuais.
2. **Só na primeira abertura e com o banco completamente vazio.** Se existe qualquer página, ativa ou na lixeira, nada é
   criado: quem já usava o app não ganha páginas que não pediu (inclusive na migração dos dados de nomes antigos).
3. **Uma única vez.** Um marcador (`notes_meta`, chave `samples_seeded`) é gravado ao decidir, para que os exemplos não
   voltem depois que a pessoa apagar tudo.
4. **Mora no módulo de notas** (`samples.rs`), não no app: o conteúdo é do domínio dele. O app só chama
   `seed_if_first_run` logo depois de abrir o banco; uma falha é registrada no terminal e não impede o app de abrir.
5. **O conteúdo é gerado no formato de blocos do editor**, com o texto simples espelhado em `body` (para a busca).
   Há um teste que garante o JSON e as bases; o editor de verdade foi usado para conferir que as páginas abrem.

## Limites conhecidos

- A criação não é atômica (as regras das bases usam transações próprias, que não se aninham): uma falha no meio deixaria
  páginas parciais. Na próxima abertura elas contam como "páginas existentes" e nada é recriado.
- Não há botão para recriar os exemplos depois. A função `create_samples` existe para isso, sem tela por enquanto.
- Os textos dos exemplos estão só em português.
