# 0012. Editor de blocos (BlockNote) e subpáginas como link

**Status:** Aceita

## Contexto

O produto precisa de conteúdo em **blocos independentes**, como no Notion (menu `/`, listas, tarefas, títulos,
reordenar), e as **subpáginas devem aparecer no texto da página-mãe como um link**.

## Decisões

1. **BlockNote** como editor (MPL-2.0, ainda 0.x), com a interface em Mantine. Alternativa avaliada: editor
   próprio, mais leve e totalmente nosso, mas bem mais lento de chegar ao comportamento do Notion.
   **Exceção consciente** ao princípio de poucas dependências: o editor é grande (~5 MB instalado) e tem API que
   pode mudar entre versões 0.x.
2. **A biblioteca fica isolada** num único arquivo (`ui/BlockEditor.tsx`), atrás do contrato `BlockEditorProps`, e
   é **carregada sob demanda** (`LazyBlockEditor`). Os testes usam um editor falso (`test-block-editor.tsx`),
   injetado por `createNotesModule(gateway, { BlockEditor })`. Os tipos do BlockNote não são compatíveis com
   `exactOptionalPropertyTypes`; em vez de afrouxar a regra do projeto, a incompatibilidade ficou confinada
   a esse arquivo.
3. **Dados:** migração 3 adiciona `content` (os blocos em JSON; o banco recusa JSON inválido e o Rust exige uma
   LISTA de até 5 MB). `body` continua como o **texto simples** (espelho gerado pela interface), reservado
   para a busca. Páginas antigas (`content = "[]"`) são convertidas **ao serem abertas** (cada linha vira um
   parágrafo) e a conversão é gravada na primeira edição.
4. **Subpágina é um bloco** (`childPage`) que guarda só o **id** da página; o título vem da página (renomear
   atualiza o bloco; página indisponível aparece como "Página indisponível").
5. **A árvore continua sendo a fonte da hierarquia.** Ao abrir uma página, o editor sincroniza os blocos:
   subpágina sem bloco ganha um no fim; bloco de página que deixou de ser filha (movida ou excluída), ou
   repetido, é removido. A sincronização **só roda com a lista de páginas carregada** (com a lista ainda vazia
   apagaria blocos válidos) e protege a página recém-criada, que chega à lista um instante depois do bloco.
6. **Apagar o bloco** de uma subpágina a manda para a **lixeira** (reversível), como no Notion.
7. **`/Página`** cria a subpágina, grava o bloco **antes** de abri-la (abrir fecha o editor) e a abre.
8. Imagem, vídeo, áudio e arquivo ficam **fora** por enquanto (exigem envio de arquivos).

## Limites conhecidos

- O editor de verdade **não é testado em teste automático** (a biblioteca não roda direito no jsdom). A lógica
  própria (conversão, texto simples, sincronização de subpáginas) é pura e testada; o comportamento do editor é
  verificado rodando o app.
- Apagar um bloco de subpágina sem querer manda a página para a lixeira (reversível).
- Abrir uma página cuja árvore mudou fora do editor a altera (os blocos são sincronizados) e atualiza "Editado há".
- O menu `/` usa o idioma português da biblioteca; não verifiquei todos os textos.
