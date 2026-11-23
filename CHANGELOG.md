# Changelog

Todas as mudanças relevantes do Tramion são registradas aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa
[versionamento semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Alterado

- Novo design "papel e tinta": rampa neutra quente (papel no claro, grafite no escuro), um único acento terracota,
  serifa só em títulos grandes, marca e ícone chapados e um ponto de acento marcando o item ativo. Contraste mínimo
  de 4,5:1 em todos os textos. Veja o [ADR 0017](docs/adr/0017-design-papel-e-tinta.md).
- O guia das páginas de exemplo passou a se chamar "Guia rápido".

### Adicionado

- Visões lista, galeria e calendário nas bases de dados, botão Esvaziar lixeira e páginas de exemplo na primeira abertura.

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

[0.1.0]: https://github.com/JaoPedr0o/tramion/releases/tag/v0.1.0
