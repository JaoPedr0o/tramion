# Visão do produto

O Aesthetic Notes é uma plataforma desktop de organização pessoal. A inspiração inicial é o Notion,
mas o objetivo **não** é copiá-lo: é ter uma base mais modular, em que funcionalidades possam ser
adicionadas, substituídas ou removidas sem reescrever o restante.

## Capacidades pretendidas (progressivas)

Notas, páginas hierárquicas, bancos de dados personalizados, visualizações, tarefas e projetos,
relações entre informações, modelos reutilizáveis, blocos de conteúdo, espaços de trabalho
personalizáveis e módulos adicionais.

A arquitetura é preparada para tudo isso; **a implementação é gradual**, começando pelas notas.

## Princípios

1. **Local-first:** sem login, sem backend remoto, funciona offline. Sincronização é possível no futuro,
   mas nada pode depender de nuvem estruturalmente.
2. **Modularidade real:** limites entre módulos verificados automaticamente, não só por convenção.
3. **Sem antecipação excessiva:** a estrutura só ganha complexidade quando um caso real exige.

## Fora de escopo por enquanto

Sincronização entre dispositivos, plugins de terceiros carregados em tempo de execução, colaboração,
versão mobile.
