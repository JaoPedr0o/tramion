# 0018. Busca, visões salvas, modelos, Markdown e lembretes

**Status:** Aceita

## Contexto

O roadmap pedia, de uma vez: busca global, filtros e visões salvos, calendário semanal, exportar e importar Markdown,
modelos de página, duplicar página e notificações de tarefas. Este registro reúne as decisões de cada um.

## Decisões

### Busca global (`Ctrl + K`)

- A busca roda no **Rust**, sobre o texto simples espelhado em `body` e o título, só nas páginas ativas. Ignora
  maiúsculas e acentos (dobrando caractere a caractere, sem dependência nova) e exige **todas** as palavras.
- Ordenação: título igual, título que começa com a busca, título que contém e, por último, só o texto; empate pela
  página mais recente. Cada resultado traz um trecho do texto em uma linha.
- Limite: 50 resultados e 100 caracteres de busca. Percorre todas as páginas a cada busca (adequado para uso pessoal; um
  índice de texto completo seria o próximo passo se uma base ficar muito grande). Cobre títulos e texto das páginas, **não**
  o conteúdo das células das bases.
- Na tela: caixa modal acessível (combobox e lista), com pausa de 120 ms, descarte de respostas fora de ordem e foco
  devolvido ao fechar. Se o editor já tratou `Ctrl + K` (criar link com texto selecionado), a busca não abre.

### Visões salvas e calendário semanal

- Cada base tem **uma ou mais visões** (`notes_view`): nome e configuração em JSON (forma de exibição, filtros, ordenação,
  coluna do quadro, coluna e escala do calendário). Toda base tem ao menos uma; a última não pode ser apagada. A
  migração 9 dá a visão "Tabela" às bases existentes. Limite: 20 visões por base, 20 filtros por visão.
- A configuração é validada e **limpa** no Rust (só campos conhecidos). Referências a colunas apagadas são ignoradas pela
  tela. Alterações de filtro e ordenação são gravadas com uma pausa de 500 ms (e ao sair da tela).
- O calendário ganhou a escala **semana**, além do mês (a semana vai de domingo a sábado).

### Duplicar página e modelos

- **Duplicar** copia a página e toda a subárvore ativa, numa transação: conteúdo, símbolo, capa e, nas bases, colunas,
  visões, lembretes e células, com **ids novos**. Links internos (subpáginas e menções a páginas copiadas) são reapontados
  para as cópias; menções a páginas de fora continuam apontando para as originais. A cópia não é favorita e vai para o fim
  das irmãs.
- **Modelos** são embutidos no aplicativo (reunião, semana, projeto, diário e lista de tarefas). Modelos criados pela pessoa
  ficam para depois.

### Exportar e importar Markdown

- Exportar grava `Título.md` na pasta **Downloads**, com nome seguro (sem separadores de pasta nem caracteres proibidos no
  Windows, até 100 caracteres) e **sem sobrescrever** (`Título (2).md`). Uma base vira uma tabela Markdown.
- Importar lê um `.md` no navegador do app e cria uma página: o primeiro título vira o título da página. Entende títulos,
  listas aninhadas, tarefas, citações, código com linguagem, tabelas, imagens e estilos. **Só links e imagens `http` e
  `https`** são aceitos; qualquer outro esquema vira texto. Limite de 2 milhões de caracteres.
- O Markdown não guarda cores nem menções: elas viram texto simples.

### Lembretes de tarefas

- Cada base tem uma configuração opcional (`notes_reminder`): qual coluna de **data** é o prazo e quando a tarefa conta como
  **concluída** (caixa marcada, ou uma opção de seleção). O Rust valida que as colunas são da própria base e do tipo certo.
- O Rust responde `due_tasks(hoje)`: linhas de bases ativas com lembretes ligados, prazo hoje ou vencido e não concluídas. A
  data de hoje vem **do relógio do usuário**, para não depender de fuso horário.
- Na tela: **Lembretes** na barra lateral (contagem e lista, atrasadas e de hoje) e o aviso diário do **sistema**, uma vez por
  dia, a partir de um horário configurável (padrão 09:00), pelo plugin oficial de notificações do Tauri. As preferências
  ficam no armazenamento do app. O aviso só dispara **com o Tramion aberto**; se abrir depois do horário, avisa na abertura.
- Datas não têm hora: o lembrete é diário, não por horário da tarefa.

## Limites conhecidos

- Sem o app aberto não há notificação (rodar em segundo plano, com ícone na bandeja, ficou para depois).
- As notificações do sistema dependem do ambiente gráfico (no Linux, de um serviço de notificações); sem permissão, o aviso
  continua na barra lateral.
- Exportar não leva imagens enviadas (só o endereço delas), e importar não traz arquivos locais.
- Os instaladores de Windows e macOS ainda não foram validados nem assinados.
