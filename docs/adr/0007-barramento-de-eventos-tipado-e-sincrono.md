# 0007. Barramento de eventos tipado e síncrono

**Status:** Aceita

## Contexto

Módulos não podem se importar. Precisam de um canal para reagir ao que acontece em outros
(ex.: `tasks` reagir à exclusão de uma nota) sem conhecê-los.

## Decisão

Barramento **tipado e síncrono** em `@aun/core`:

- Cada evento tem nome e formato definidos em `AppEvents` (pacote `@aun/contracts`). Publicar com formato errado
  não compila. O catálogo mora em `contracts` porque quem escuta precisa conhecer o formato sem importar
  o módulo que publica.
- `emit` chama os assinantes na hora, na ordem de assinatura.
- **Falha isolada:** um assinante que lança erro não afeta quem publicou nem os outros; o erro vai para
  `onHandlerError`.

Alternativa considerada: barramento assíncrono com fila. Mais flexível, porém mais difícil de depurar e
sem caso de uso real ainda. Pode ser introduzido depois, por trás da mesma interface `EventBus`.

## Consequências

- Simples de testar e de raciocinar sobre a ordem de execução.
- Um assinante lento trava quem publicou. Trabalho pesado deve ser agendado pelo próprio assinante.
- O contrato de eventos é compartilhado: adicionar um evento é uma mudança em `contracts`.
