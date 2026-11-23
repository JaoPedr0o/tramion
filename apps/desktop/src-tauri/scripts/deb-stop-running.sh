#!/bin/sh
# Antes de instalar ou atualizar: encerra o Tramion em execução. Desde a 0.3.0, fechar a janela só a esconde na bandeja
# do sistema, então, sem isto, uma atualização deixaria a versão ANTIGA rodando escondida, e abrir o atalho traria de
# volta a janela velha em vez de iniciar a nova. O app salva as edições sozinho, poucos segundos depois de digitar.
pkill -x tramion >/dev/null 2>&1 || true
exit 0
