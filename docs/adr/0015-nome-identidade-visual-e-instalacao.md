# 0015. Nome, identidade visual e instalação

**Status:** Aceita

## Contexto

O aplicativo se chamava "Aesthetic Ugly Notes". O nome passou a ser **Aesthetic Notes**, com uma identidade visual
própria e uma forma de instalar no computador do dono.

## Decisões

1. **Nome em todo lugar:** pacotes `@aesthetic/*`, crates `aesthetic-*`, banco `aesthetic-notes.db`, identificador
   `dev.aesthetic.notes`, textos e documentação. O contêiner de desenvolvimento continua `aun` (é o ambiente, não o
   produto) e a pasta do repositório pode ser renomeada à vontade (nenhum arquivo depende dela).
2. **Dados do nome antigo não se perdem.** O identificador define a pasta de dados, então na primeira abertura o app
   **move** (`rename`, atômico) `dev.aun.notes` para `dev.aesthetic.notes`, renomeia o banco e os arquivos `-wal` e
   `-shm` juntos e nunca sobrescreve nada que já exista. A migração 6 corrige os endereços das imagens enviadas, que
   guardam o caminho completo. As preferências de tema e barra lateral antigas continuam valendo (leitura da chave
   antiga como alternativa).
3. **Identidade:** paleta "Pétala" (lavanda, rosé e creme) no claro e "Crepúsculo" (roxo profundo e lilás) no escuro,
   definidas só nos tokens. Títulos em **Fraunces**, texto em **Inter**, ambas **embutidas** no app (fontsource):
   o app é local e não pode depender da internet nem de fontes do sistema.
4. **Marca:** um "A" com uma faísca sobre degradê lavanda → rosé → pêssego. O desenho existe em dois lugares com o
   mesmo traçado: o componente `Logo` (lateral, tela inicial) e `icons/source/icon.svg`, de onde saem todos os ícones
   (`pnpm tauri icon`). Quem alterar a marca deve alterar os dois.
5. **Instalação no Linux (Bazzite):** o sistema do computador é imutável e o app é construído e roda no contêiner de
   desenvolvimento. O pacote `.deb` é gerado ali (`pnpm tauri build --bundles deb`), instalado no contêiner e
   **exportado** para o menu de aplicativos do sistema com `distrobox-export`. O ícone aparece no menu como qualquer
   aplicativo, e os dados ficam na pasta pessoal, compartilhada com o sistema.

## Limites conhecidos

- O app instalado só abre com o contêiner `aun` disponível (o `distrobox-export` o inicia sozinho, com alguns segundos
  a mais na primeira abertura depois de ligar o computador).
- Não há instalador para Windows ou macOS (precisaria ser construído em cada sistema).
- O app instalado é a versão "release": o conteúdo da tela é o empacotado, não o do servidor de desenvolvimento.
