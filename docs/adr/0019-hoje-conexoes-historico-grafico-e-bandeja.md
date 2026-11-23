# 0019. Hoje, conexões, histórico, gráfico, exportação e bandeja

**Status:** Aceita

## Contexto

Depois da 0.2.0, a rodada seguinte acrescentou recursos que diferenciam o Tramion: uma tela de dia a dia, ligações entre ideias,
volta no tempo, mais formas de ver os dados e mais controle sobre eles (exportação, modelos e uso em segundo plano).

## Decisões

### Página "Hoje"

Agrupa o que pede atenção: tarefas atrasadas e de hoje (bases com lembretes ligados), a agenda dos próximos 7 dias
(`upcoming_tasks`, de 1 a 60 dias), as páginas editadas por último (sem as linhas de bases) e os favoritos. Reusa a varredura
de tarefas dos lembretes, agora única (`scan_tasks`).

### Backlinks e grafo

- **Backlinks** ("Mencionada em"): as páginas ativas que mencionam (ou têm como subpágina no texto) a página aberta. O Rust
  filtra pelo id no conteúdo e confirma lendo o JSON, para um texto que apenas contém o id não contar.
- **Grafo:** páginas como pontos; linhas cheias para menções e subpáginas no texto, tracejadas para a hierarquia (uma
  subpágina escrita no texto do pai não vira segunda ligação). Linhas de bases e a lixeira ficam de fora; no máximo 400
  páginas (as editadas por último).
- O desenho é calculado no navegador por forças (Fruchterman-Reingold) **sem aleatoriedade**: a mesma entrada dá o mesmo
  desenho. Sem dependência nova. Tudo é calculado sob demanda, sem tabela de ligações para manter.

### Histórico de versões

Antes de uma edição sobrescrever a página, o estado anterior é guardado (`notes_version`): no máximo um a cada 10 minutos, até
30 por página, nunca de página vazia, só se título ou conteúdo mudaram. Restaurar guarda **sempre** o estado atual antes, então
a restauração também se desfaz. Guardar histórico é "melhor esforço": se falhar, a edição não é desfeita. As versões somem
com a página (apagar de vez) e voltam junto com ela ao restaurar da lixeira.

### Busca nas células e modelos da pessoa

- A busca global passa a considerar o conteúdo das células das linhas (texto, números, nome das opções de seleção).
- "Salvar como modelo" guarda nome, símbolo, texto e conteúdo (sem subpáginas) em `notes_user_template` (limite de 30). Bases
  de dados não viram modelo.

### Gráfico

Nova visão de base: barras por coluna de seleção, seleção múltipla, caixa de seleção ou mês de uma data, contando linhas ou
somando uma coluna de número. A agregação é uma função pura testada; as barras usam a cor da opção ou o acento do app. O modo
`chart` e `valueProperty` fazem parte da configuração validada da visão.

### Exportar tudo

Grava todas as páginas em `Downloads/Tramion`, espelhando a hierarquia (uma pasta por página com subpáginas; base como
tabela). Nomes seguros, sem colisão (sem diferenciar maiúsculas) e sem sair da pasta. Uma nova exportação **substitui** os
arquivos da anterior e **nunca apaga nada**. Limite de 5.000 arquivos e 200 MB. É de mão única: não relê as alterações feitas
nos arquivos.

### Bandeja do sistema e captura rápida

- Com o ícone na bandeja, fechar a janela só a **esconde** e o app segue rodando (os lembretes continuam). É "melhor esforço":
  se a bandeja não puder ser criada, fechar a janela fecha o aplicativo. O menu da bandeja tem Abrir, Captura rápida e Sair.
  Uma segunda abertura traz a janela de volta (instância única).
- **Captura rápida** (`Ctrl + Alt + N`, botão na barra lateral ou item da bandeja): a primeira linha vira o título e o texto é
  guardado como página na "Caixa de entrada", criada na primeira vez.

## Limites conhecidos

- **Atalho global:** não há atalho que funcione com o app em segundo plano (em Wayland isso depende do ambiente); a captura
  rápida abre pela bandeja ou, com o app em foco, por `Ctrl + Alt + N`.
- A bandeja e as notificações dependem do ambiente gráfico do sistema; não foram verificadas aqui além da compilação.
- O grafo e os backlinks percorrem as páginas a cada pedido (adequado ao uso pessoal).
- O histórico mostra o texto simples da versão, não o desenho dos blocos.
- **Não feito nesta rodada:** páginas criptografadas com senha e IA local. Criptografar exige tratar todos os caminhos que
  leem o texto (histórico, busca, ligações, exportação, modelos, duplicação); ficam para uma etapa própria e cuidadosa.
