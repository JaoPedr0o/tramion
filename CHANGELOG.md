# Changelog

Todas as mudanças relevantes do Tramion são registradas aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa
[versionamento semântico](https://semver.org/lang/pt-BR/).

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

[0.2.0]: https://github.com/JaoPedr0o/tramion/releases/tag/v0.2.0
[0.1.0]: https://github.com/JaoPedr0o/tramion/releases/tag/v0.1.0
