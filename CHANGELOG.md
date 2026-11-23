# Changelog

Todas as mudanças relevantes do Tramion são registradas aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa
[versionamento semântico](https://semver.org/lang/pt-BR/).

## [0.4.1] - 2026-11-24

### Corrigido

- **Android:** o conteúdo não fica mais sob a barra de status nem sob a de navegação (nem sob o teclado ou o recorte da
  câmera). O fundo atrás das barras segue o tema.
- **Atualizar no Linux:** o instalador encerra o Tramion em execução. Antes, a versão antiga continuava escondida na
  bandeja e o atalho trazia de volta a janela velha.
- A mensagem de falha de conexão ao parear agora lista os endereços tentados.

### Alterado

- **Pareamento mais fácil:** o celular abre a câmera sozinho para ler o QR do computador, e um botão troca quem mostra e
  quem lê o código (colar o código continua disponível). Os aparelhos aparecem com nome (Computador, Celular) e o QR
  ignora interfaces virtuais, priorizando Wi-Fi e cabo.
- **Layout de celular:** a barra lateral é uma gaveta que se abre arrastando da borda esquerda e se fecha arrastando para
  a esquerda, tocando no fundo ou escolhendo uma página; margens e janelinhas se adaptam a telas pequenas.

## [0.4.0] - 2026-11-24

### Adicionado

- **Sincronização entre aparelhos pela rede local, sem servidor nem conta** (veja o
  [ADR 0020](docs/adr/0020-proposta-sincronizacao-entre-aparelhos.md)): janela **Parear celular** com QR de uso único,
  canal criptografado, e mescla por registro em que edições simultâneas viram cópias em conflito (nada se perde).
- **App para Android** (APK assinado nas releases): parear colando o código do computador, **Sincronizar agora** e
  barra lateral em formato de gaveta em telas pequenas.

### Segurança

- O segredo do QR é trocado por um segredo definitivo dentro do canal seguro e o do QR morre no primeiro uso; remover
  um aparelho corta o acesso.

### Limites conhecidos

- O celular precisa estar na mesma rede do computador, com o Tramion aberto; se o IP do computador mudar, é preciso
  parear de novo. Ainda não há leitor de QR pela câmera (cola-se o código), sincronização em segundo plano, nem
  sincronização de imagens, lembretes e histórico de versões.
- O APK foi compilado e assinado, mas o app ainda não foi verificado em um celular real.

## [0.3.0] - 2026-11-24

### Adicionado

- Página **Hoje**: tarefas atrasadas e de hoje, agenda dos próximos 7 dias, páginas recentes e favoritos.
- **Backlinks** ("Mencionada em") em cada página e o **Grafo** de conexões entre as páginas.
- **Histórico de versões** das páginas, com visualização e restauração (o estado atual também fica guardado).
- Visão de **gráfico** nas bases de dados (barras por seleção, caixa ou mês, contando ou somando).
- **Modelos criados por você** (Salvar como modelo) e busca global também nas células das bases.
- **Exportar tudo** como Markdown para uma pasta, espelhando a hierarquia.
- **Captura rápida** (`Ctrl + Alt + N`) para a Caixa de entrada e **ícone na bandeja** do sistema (o app segue rodando
  quando a janela é fechada, e os lembretes continuam). Veja o [ADR 0019](docs/adr/0019-hoje-conexoes-historico-grafico-e-bandeja.md).

## [0.2.0] - 2026-11-23

### Alterado

- Novo design "papel e tinta": rampa neutra quente (papel no claro, grafite no escuro), um único acento terracota,
  serifa só em títulos grandes, marca e ícone chapados e um ponto de acento marcando o item ativo. Contraste mínimo
  de 4,5:1 em todos os textos. Veja o [ADR 0017](docs/adr/0017-design-papel-e-tinta.md).
- O guia das páginas de exemplo passou a se chamar "Guia rápido".

### Adicionado

- Visões lista, galeria e calendário nas bases de dados, botão Esvaziar lixeira e páginas de exemplo na primeira abertura.
- Busca global (`Ctrl + K`) no título e no texto das páginas, sem diferenciar acento nem maiúscula.
- Visões salvas por base (nome, forma de exibição, filtros, ordenação) e calendário semanal.
- Duplicar página (com subpáginas e bases) e cinco modelos de página.
- Exportar a página como Markdown (pasta Downloads) e importar um arquivo Markdown.
- Licença MIT.
- Lembretes de tarefas: configuração por base, painel "Lembretes" na barra lateral e aviso diário do sistema.
  Veja o [ADR 0018](docs/adr/0018-busca-visoes-modelos-markdown-e-lembretes.md).

## [0.1.0] - 2026-11-23

Primeira versão pública.

### Adicionado

- Editor de blocos com menu `/`, subpáginas como links, menções (`@`), código com linguagem e detecção automática,
  imagens, vídeo e áudio, cartão de link, vídeos do YouTube e Vimeo, ícone e capa nas páginas e **Transformar em**.
- Bases de dados com colunas tipadas (texto, número, seleção, seleção múltipla, data, caixa de seleção e link) e cinco
  formas de exibição: tabela, quadro, lista, galeria e calendário, com filtros e ordenação.
- Lixeira com restaurar, apagar de vez e esvaziar lixeira.
- Páginas de exemplo na primeira abertura.
- Tema claro, escuro e automático; barra lateral recolhível.
- Backup automático antes de atualizar o banco e movimentação automática dos dados de nomes anteriores do aplicativo.
- Identidade visual do Tramion e ícone do aplicativo.

[0.4.1]: https://github.com/JaoPedr0o/tramion/releases/tag/v0.4.1
[0.4.0]: https://github.com/JaoPedr0o/tramion/releases/tag/v0.4.0
[0.3.0]: https://github.com/JaoPedr0o/tramion/releases/tag/v0.3.0
[0.2.0]: https://github.com/JaoPedr0o/tramion/releases/tag/v0.2.0
[0.1.0]: https://github.com/JaoPedr0o/tramion/releases/tag/v0.1.0
