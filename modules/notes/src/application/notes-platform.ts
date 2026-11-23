/**
 * O que o módulo precisa do SISTEMA (e não dos dados das notas): guardar arquivos enviados e abrir links no
 * navegador. Fica fora do `NotesGateway` porque não é persistência de notas, e é um contrato à parte para
 * que a interface e os testes não dependam do Tauri.
 */
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
  /** Mostra uma notificação do sistema (pede a permissão na primeira vez; sem permissão, não faz nada). */
  notify(title: string, body: string): Promise<void>;
  /** Registra no terminal do app um erro da interface (para não sumir quando a tela quebra). */
  reportError(message: string): Promise<void>;
}
