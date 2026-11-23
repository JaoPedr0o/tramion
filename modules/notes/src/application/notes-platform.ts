/**
 * O que o módulo precisa do SISTEMA (e não dos dados das notas): guardar arquivos enviados e abrir links no
 * navegador. Fica fora do `NotesGateway` porque não é persistência de notas, e é um contrato à parte para
 * que a interface e os testes não dependam do Tauri.
 */
/** O QR de pareamento. */
export interface PairingOffer {
  readonly code: string;
  readonly svg: string;
  /** Quando deixa de valer (ms desde 1970). */
  readonly expiresAt: number;
}

/** Um aparelho pareado. */
export interface PairedDevice {
  readonly device: string;
  readonly name: string;
  readonly pairedAt: number;
  readonly lastSyncAt: number | null;
  /** Este aparelho sabe onde procurá-lo (então "Sincronizar agora" o alcança). */
  readonly canDial: boolean;
}

/** O resultado de sincronizar com um aparelho. */
export interface SyncReport {
  readonly device: string;
  readonly name: string;
  readonly ok: boolean;
  /** Quantos registros foram gravados aqui. */
  readonly applied: number;
  readonly conflicts: number;
  readonly error: string | null;
}

export interface NotesPlatform {
  /** Guarda um arquivo enviado (imagem, vídeo ou áudio) e devolve o endereço para exibi-lo. */
  uploadAsset(file: File): Promise<string>;
  /** Abre um link http(s) no navegador do sistema. */
  openExternal(url: string): Promise<void>;
  /** Grava o Markdown de uma página na pasta Downloads (nome seguro, sem sobrescrever) e devolve o caminho. */
  saveMarkdown(title: string, content: string): Promise<string>;
  /** Grava todas as páginas (já em Markdown) na pasta Downloads/Tramion e devolve a pasta e quantos arquivos foram gravados. */
  exportAll(
    files: readonly { path: readonly string[]; content: string }[],
  ): Promise<{ folder: string; written: number }>;
  /** Abre um pareamento: devolve o QR (SVG) e o código que o celular lê. Vale poucos minutos e um único uso. */
  startPairing(): Promise<PairingOffer>;
  /** Fecha o pareamento aberto (o QR deixa de valer). */
  cancelPairing(): Promise<void>;
  /** Os aparelhos pareados. */
  listPeers(): Promise<PairedDevice[]>;
  /** Desfaz o pareamento de um aparelho. */
  removePeer(device: string): Promise<void>;
  /** Celular: pareia com um computador pelo texto do QR e já sincroniza. */
  pairWithCode(code: string): Promise<SyncReport>;
  /** Celular: sincroniza com os computadores pareados (um relatório por aparelho). */
  syncNow(): Promise<SyncReport[]>;
  /** Avisa quando o item "Captura rápida" da bandeja do sistema é escolhido; devolve como cancelar o aviso. */
  onQuickCapture(handler: () => void): () => void;
  /** Mostra uma notificação do sistema (pede a permissão na primeira vez; sem permissão, não faz nada). */
  notify(title: string, body: string): Promise<void>;
  /** Registra no terminal do app um erro da interface (para não sumir quando a tela quebra). */
  reportError(message: string): Promise<void>;
}
