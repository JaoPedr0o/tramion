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
