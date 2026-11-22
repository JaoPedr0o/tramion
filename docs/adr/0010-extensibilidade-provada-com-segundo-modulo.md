# 0010. Extensibilidade provada com um segundo módulo

**Status:** Aceita

## Contexto

A promessa central da arquitetura é que funcionalidades possam ser adicionadas, substituídas ou removidas sem
reescrever o restante. Até aqui só existia um módulo, então a promessa não tinha sido posta à prova.

## O que foi feito

Foi criado um módulo **descartável** (`modules/probe`, depois apagado) que escutava `note.deleted` e
`note.purged` e declarava `dependsOn: ["notes"]`, sem importar o módulo de notas.

Resultados medidos:

- Os testes de integração passaram com o pacote real, sem nenhuma alteração.
- O lint passou no pacote e **barrou** um `import "@aun/notes"` colocado de propósito dentro dele.
- Para o módulo funcionar foi editado **zero código** em `notes`, `core` e `contracts`. As únicas edições em
  arquivos existentes foram as dependências do app (`package.json` e lockfile): é a composição, e cabe ao app.

## Decisão

O pacote foi apagado e a garantia ficou como teste permanente
(`apps/desktop/src/modules.integration.test.tsx`), em que o segundo módulo é só um manifesto dentro do teste
(`test-support/probe.ts`). Assim a promessa continua protegida sem código de mentira no repositório. Os casos:

1. um segundo módulo ouve eventos do primeiro sem importá-lo;
2. `dependsOn` garante a ordem mesmo se o segundo for cadastrado antes;
3. se a operação falha, o outro módulo **não** é avisado;
4. um módulo com defeito não derruba o primeiro (a exclusão acontece e o usuário não vê erro);
5. remover o segundo módulo não afeta o primeiro.

Também ficou permanente um teste de fronteira com um pacote real: **qualquer** módulo importando `@aun/notes`
é barrado pelo lint.

## Limites conhecidos

- Se um módulo novo precisar de um evento que ainda não existe, é preciso editar `packages/contracts`
  (o catálogo de eventos é compartilhado de propósito). O custo é pequeno, mas existe.
- O módulo só foi provado no lado TypeScript. O lado Rust (migrações de dois módulos com `depends_on`) está
  coberto pelos testes do `infra-sqlite`, mas não foi exercitado com dois crates de módulo reais.
- A lista de notas **depende** dos eventos `note.*` para se atualizar (ADR 0009, item 26). Quem alterar a
  publicação dos eventos quebra a tela, e os testes avisam.

## Achado colateral

O teste de integração revelou um defeito real de UX: o erro de uma ação (excluir, fixar) era anexado ao texto
de estado do salvamento, podendo exibir algo contraditório como "Salvo. Algo deu errado". Agora falhas de
ações têm um aviso próprio (`role="alert"`).
