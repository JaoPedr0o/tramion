# 0013. Incorporações, ícone e capa de página, e linguagem do código

**Status:** Aceita

## Contexto

Para se aproximar do Notion, as páginas precisam de menções, links e vídeos incorporados, envio de imagens,
símbolo (emoji) e capa, e o bloco de código precisa de linguagem.

## Decisões

1. **Menções (`@`)** são conteúdo inline que guarda só o id da página; o título e o símbolo vêm da página.
2. **Abrir links:** comando do Rust (`open_external`) que só aceita `http` e `https` (recusa `javascript:`, `file:`,
   `data:` e afins); a interface nunca navega o próprio app para um link externo.
3. **Vídeo incorporado** só do YouTube e do Vimeo. O domínio é comparado por **igualdade** (`youtube.com.malicioso.com`
   não passa) e o identificador é conferido; a incorporação usa o domínio sem rastreadores do YouTube. A CSP libera
   apenas esses dois domínios em `frame-src`.
4. **Envio de arquivos** (imagem, vídeo, áudio): o Rust valida (extensão, assinatura dos primeiros bytes para
   imagens e tamanho de até 50 MB; SVG fica de fora porque pode carregar scripts), nomeia o arquivo pelo resumo
   SHA-256 do conteúdo (nunca pelo nome original) e o guarda em `<dados do app>/assets/`. É exibido pelo protocolo
   de arquivos do Tauri, restrito a essa pasta. O corpo da chamada vai **bruto**, não em JSON.
5. **Imagens, vídeo e áudio por link** exigem liberar `https` na CSP (`img-src`, `media-src`). Contrapartida:
   um recurso de outro site expõe o IP do usuário a ele.
6. **Ícone e capa** moram em colunas próprias (migração 4). A capa é texto com **três formatos**: `color:#rrggbb`,
   `gradient:<nome da galeria>` e `image:<endereço http/https/arquivo do app>`; o Rust recusa qualquer outro, e a
   interface ainda codifica o endereço ao montar o estilo (defesa em duas camadas). **Não alteram `updated_at`**:
   aparência não é conteúdo e não gera conflito de edição.
7. **Linguagem do código:** lista de linguagens e cores de sintaxe do próprio editor. **Detecção ao colar** em
   bloco sem linguagem escolhida: sinais inequívocos (shebang, `<!DOCTYPE`, JSON válido, palavras características
   de Java, C#, Rust e YAML) e, depois, o `highlight.js` restrito às linguagens que o editor sabe colorir. Abaixo
   de um limite de confiança, não chuta. Respeita a escolha do usuário.
8. **"Transformar em"** no menu do bloco (texto, títulos, listas, tarefa, alternável, citação, código).
9. **Blocos de imagem/vídeo abandonados** (sem endereço) são removidos ao abrir a página e quando o cursor sai de
   perto deles, com uma pausa e sem agir enquanto o seletor de arquivo está aberto.
10. O editor ocupa **toda a altura da página**, para que soltar um bloco abaixo do último seja reconhecido.

## Limites conhecidos

- O endereço de uma imagem enviada é o do protocolo de arquivos com o **caminho absoluto**: se a pasta de dados do app
  mudar de lugar, as imagens enviadas quebram. Arquivos que deixam de ser usados não são apagados.
- A correção de "arrastar até o fim" e o menu "Transformar em" **não têm teste automático** (dependem do editor de
  verdade): são verificados rodando o app.
- O YouTube pode recusar incorporar a partir de uma origem local; não foi confirmado.
- A detecção de linguagem é heurística: trechos curtos ou ambíguos podem não ser reconhecidos.
