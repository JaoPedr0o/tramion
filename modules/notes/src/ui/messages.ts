import { NotesError, type NotesErrorCode } from "../domain/errors.ts";

/** Textos para o usuário, escolhidos pelo CÓDIGO do erro (o texto técnico do Rust nunca é exibido). */
const MESSAGES: Record<NotesErrorCode, string> = {
  "notes.title-empty": "O título não pode ficar vazio.",
  "notes.title-too-long": "O título é longo demais (máximo de 200 caracteres).",
  "notes.icon-invalid": "Este símbolo não é válido.",
  "notes.cover-invalid": "Esta capa não está num formato aceito.",
  "notes.not-database": "Esta página não é uma base de dados.",
  "notes.property-not-found": "Esta coluna não existe mais.",
  "notes.property-invalid": "O nome, o tipo ou as opções desta coluna não são válidos.",
  "notes.view-not-found": "Esta visão não existe mais.",
  "notes.view-invalid":
    "O nome ou a configuração desta visão não são válidos (a última visão de uma base não pode ser apagada).",
  "notes.cell-invalid": "Este valor não serve para esta coluna.",
  "notes.limit-reached": "Limite atingido (máximo de 50 colunas e 20 visões por base).",
  "notes.url-invalid": "Este endereço não é um link http ou https válido.",
  "notes.asset-too-large": "O arquivo é grande demais (máximo de 50 MB).",
  "notes.asset-type-not-allowed":
    "Este tipo de arquivo não é aceito (use imagem, vídeo mp4/webm ou áudio mp3/ogg/wav).",
  "notes.asset-invalid": "O conteúdo do arquivo não corresponde ao tipo dele.",
  "notes.content-invalid": "O conteúdo da página não pôde ser salvo (formato inválido).",
  "notes.content-too-large": "A página é grande demais para ser salva.",
  "notes.not-found": "Esta página não existe mais.",
  "notes.in-trash": "Esta página está na lixeira.",
  "notes.not-in-trash": "Esta página não está na lixeira.",
  "notes.parent-not-found": "A página de destino não existe mais.",
  "notes.parent-in-trash": "A página de destino está na lixeira.",
  "notes.cycle": "Uma página não pode ser movida para dentro dela mesma ou de uma subpágina sua.",
  "notes.conflict": "Esta página foi alterada em outro lugar.",
  "notes.internal": "Algo deu errado. Tente novamente.",
};

export function messageFor(error: unknown): string {
  return MESSAGES[error instanceof NotesError ? error.code : "notes.internal"];
}
