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
  /** Registra no terminal do app um erro da interface (para não sumir quando a tela quebra). */
  reportError(message: string): Promise<void>;
}
