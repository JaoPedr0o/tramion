# 0011. Hierarquia de páginas (páginas dentro de páginas)

**Status:** Aceita

## Contexto

Para o produto se parecer com um Notion, as notas precisam virar **páginas** que contêm outras páginas. Os
blocos e os bancos de dados dependem desse modelo (cada linha de um banco, no Notion, é uma página).

## Decisões

1. **Modelo:** colunas `parent_id` (página-mãe; `NULL` = raiz) e `position` (ordem entre irmãs), pela migração 2.
   A migração 1 não foi tocada. Páginas já existentes foram para a raiz, na ordem que a lista já mostrava.
2. **Integridade em duas camadas:** as regras em Rust impedem ciclos, e o banco ainda tem a chave estrangeira
   (recusa apagar página com filhas) e um `CHECK` (nenhuma página é mãe de si mesma).
3. **Ordem entre irmãs:** `position` é **renumerada** a cada inserção ou movimento, na mesma transação. Simples e
   correta; o custo é linear no número de irmãs, irrelevante para um app pessoal.
4. **Mover não é editar:** não altera `updated_at`, como fixar, excluir e restaurar. Organizar não causa conflito
   em quem está com a página aberta.
5. **Excluir leva a subárvore** com o **mesmo instante** de exclusão. O instante é `max(agora, maior anterior + 1)`:
   dois instantes nunca coincidem, o que permite distinguir exclusões de ocasiões diferentes.
6. **Restaurar** traz a página e só as descendentes excluídas **junto com ela** (mesmo instante). Se a mãe ainda está
   na lixeira, a página volta para a **raiz** (levando a sua própria subárvore).
7. **Apagar de vez** leva a página e toda a subárvore. Só vale para quem já está na lixeira.
8. **Lixeira por raízes:** lista só a raiz de cada exclusão, com a contagem de subpáginas, que também aparece no
   aviso de "apagar de vez".
9. **Contrato:** a lista de páginas é **plana** (`parentId` e `position`); a árvore e o caminho de navegação são
   montados no cliente (`page-tree.ts`, funções puras e testadas).
10. **Eventos:** `delete`, `restore` e `purge` devolvem os ids de **todas** as páginas afetadas, e o serviço publica
    **um evento por página**. Novo evento `note.moved`.
11. **Interface:** árvore na barra lateral no padrão ARIA `tree` (foco itinerante; setas, Home, End, Enter, Espaço),
    seção **Fixadas** à parte (fixar não reordena a árvore), caminho de navegação no editor e **Nova subpágina**
    (botão e `Ctrl+Shift+N`). Texto da interface: **"Páginas"** (o módulo continua `notes` por dentro).
12. **Mover por seletor ("Mover para…")**, não por arrastar. O seletor já omite a própria página e as descendentes.

## Verificação

- Migração 2 testada sobre um banco **que já tinha páginas** (incluindo uma na lixeira), com conferência do backup
  feito antes de migrar.
- 14 mutações no Rust e 16 na interface, todas detectadas. Duas lacunas foram achadas e fechadas: o teste de raízes da
  lixeira (exclusões em ocasiões diferentes) e dois testes de interface (posição ao mover; abrir pela seção Fixadas
  expande os ancestrais). Uma defesa redundante (`descendantIdsOf` em `moveTargets`) foi **removida**: o percurso da
  árvore já pulava a subárvore.

## Limites conhecidos

- Sem arrastar e soltar (o seletor cobre o caso, mas é menos fluido).
- A lista carrega todas as páginas ativas de uma vez (sem paginação): adequado para uso pessoal.
- O estado expandido/recolhido da árvore não é persistido entre sessões.
- Não há limite de profundidade.
- O gateway falso dos testes de interface **repete** as regras do Rust (hierarquia, lixeira por instante). Se o Rust
  mudar, ele precisa acompanhar; a prova de verdade é rodar o app.
