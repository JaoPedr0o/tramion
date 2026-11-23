# 0020. Proposta: sincronização entre aparelhos e app de celular

**Status:** Proposta (a grande atualização seguinte; nada disto está implementado)

## Contexto

Hoje o Tramion é só local. Queremos um **app de celular** que converse com o computador **sem servidor e sem conta**,
sincronizando sozinho quando os dois estiverem na mesma rede, no mesmo espírito offline-first. Um servidor opcional (para
sincronizar fora de casa) fica como uma fase final, se for desejado.

## Proposta

1. **Preparar os dados para sincronizar** (serve a qualquer caminho): cada registro (página, coluna, célula, visão...) ganha
   identificador do aparelho de origem, versão e marca de apagado (_tombstone_). Hoje o `updated_at` das páginas já faz o
   papel de versão; falta o resto e a unificação.
2. **Motor de sincronização em Rust**, independente da rede: troca só o que mudou desde o último encontro; a edição mais
   recente vence por registro e a perdedora vira uma **cópia em conflito**, para nada se perder. Testável com dois aparelhos
   simulados. (Edição simultânea do mesmo texto, como no Notion, pediria CRDT: fora do escopo inicial.)
3. **Rede local:** descoberta por mDNS (`mdns-sd`), **pareamento por QR code** com chave secreta compartilhada e canal
   criptografado (TLS com chave fixada ou Noise). Só aparelhos pareados conversam.
4. **App Android** (Tauri 2 mobile, reaproveitando a interface e o núcleo Rust), instalável por APK, sem loja. iOS exige Mac e
   conta paga da Apple e fica para depois.
5. **Opcional, no fim:** servidor próprio (por exemplo, um servidor Rust numa VM gratuita) para sincronizar fora da rede local.

## Limites esperados

- Só sincroniza com os dois aparelhos na mesma rede e com o app aberto (o celular limita o segundo plano).
- Navegador (PWA) não serve para esta via, pois não consegue "escutar" a rede local: o celular precisa de app nativo.
- A interface precisa de uma versão para tela pequena.

## Andamento (atualizado)

**Status:** Em implementação. Já existem e estão testados:

- `packages/sync`: motor de mescla (fase 2).
- Migrações 0013–0015: estado por registro (hora, aparelho, lápide, mantido por gatilhos), aparelhos pareados e seus endereços (fase 1).
- `packages/lan`: código do QR, canal Noise `NNpsk0` e protocolo do encontro (fase 3).
- No computador: servidor que escuta na rede local, QR com validade de 5 minutos e uso único, janela "Parear celular".
- No celular: parear colando o código, "Sincronizar agora", layout de tela pequena e projeto Android gerado.

**Decisões de segurança:**

- O segredo do QR é trocado por um **segredo definitivo**, enviado dentro do canal já criptografado; o do QR nunca é gravado. Fotografar o QR depois não dá acesso.
- Remover um aparelho apaga o segredo: ele não conecta mais.
- Os segredos ficam em texto no banco local (que também não tem senha). Quem acessa o seu usuário no computador pode lê-los.
- O servidor só escuta com um pareamento aberto ou quando já há aparelhos pareados.

**Ainda não feito:** descoberta por mDNS (hoje o celular usa os endereços do QR; se o IP do computador mudar, é preciso parear de novo), leitor de QR pela câmera (hoje se cola o código), sincronização em segundo plano no celular, imagens anexadas, lembretes e histórico de versões, e o fluxo de assinatura do APK para as releases.
