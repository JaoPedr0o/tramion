import type {
  DatabaseData,
  DueTask,
  NewProperty,
  Property,
  PropertyChange,
  ReminderConfig,
  SetCell,
  View,
  ViewConfig,
} from "../domain/database.ts";
import type {
  MoveNote,
  NewNote,
  Note,
  NoteSummary,
  PageGraph,
  PageRef,
  SearchHit,
  SetAppearance,
  TemplateInfo,
  VersionDetail,
  VersionSummary,
  TrashSummary,
  UpdateNote,
} from "../domain/note.ts";

/**
 * Contrato com o "mundo de fora" (o backend Rust). A aplicação e a interface só conhecem esta
 * interface; quem a cumpre pode ser o Tauri de verdade ou, nos testes, um falso.
 *
 * Toda operação que falha rejeita com um `NotesError` (o adaptador converte o que vier de fora).
 */
export interface NotesGateway {
  /** Páginas ativas, PLANAS e ordenadas por posição; a árvore é montada a partir de `parentId`. */
  list(): Promise<readonly NoteSummary[]>;
  /** Só as raízes de cada exclusão, com a contagem de subpáginas excluídas junto. */
  listTrash(): Promise<readonly TrashSummary[]>;
  get(id: string): Promise<Note>;
  create(input: NewNote): Promise<Note>;
  update(input: UpdateNote): Promise<Note>;
  setPinned(id: string, pinned: boolean): Promise<Note>;
  move(input: MoveNote): Promise<Note>;
  /** Símbolo e capa da página. Não altera a versão (`updatedAt`): aparência não é conteúdo. */
  setAppearance(input: SetAppearance): Promise<Note>;
  /** `delete`, `restore` e `purge` devolvem os ids de TODAS as páginas afetadas (a página e as subpáginas). */
  delete(id: string): Promise<readonly string[]>;
  restore(id: string): Promise<readonly string[]>;
  purge(id: string): Promise<readonly string[]>;
  /** Apaga de vez TUDO o que está na lixeira; devolve os ids apagados (lista vazia se não havia nada). */
  emptyTrash(): Promise<readonly string[]>;
  /** As páginas ativas que mencionam esta página (ou a têm como subpágina no texto). */
  backlinks(id: string): Promise<readonly PageRef[]>;
  /** O grafo de conexões entre as páginas ativas. */
  graph(): Promise<PageGraph>;
  /** O histórico de versões de uma página, da mais recente para a mais antiga. */
  listVersions(noteId: string): Promise<readonly VersionSummary[]>;
  /** Uma versão inteira (texto simples). */
  getVersion(versionId: string): Promise<VersionDetail>;
  /** Restaura uma versão (guardando antes o estado atual no histórico). Respeita a versão esperada. */
  restoreVersion(input: {
    noteId: string;
    versionId: string;
    expectedUpdatedAt: number;
  }): Promise<Note>;
  /** Duplica a página e toda a subárvore ativa; devolve os ids criados, com a cópia da página escolhida primeiro. */
  duplicate(id: string): Promise<readonly string[]>;
  /** Os modelos de página embutidos. */
  listTemplates(): Promise<readonly TemplateInfo[]>;
  /** Salva uma página comum como modelo (texto, símbolo e nome; sem subpáginas). */
  saveAsTemplate(noteId: string): Promise<TemplateInfo>;
  /** Apaga um modelo criado pela pessoa. */
  deleteTemplate(templateId: string): Promise<void>;
  /** Cria uma página (ou base) a partir de um modelo, na raiz (`parentId` nulo) ou dentro de outra página. */
  createFromTemplate(input: { templateId: string; parentId: string | null }): Promise<Note>;
  /** Busca nas páginas ativas (título e texto), sem diferenciar acento nem maiúscula; no máximo `limit` resultados. */
  search(query: string, limit: number): Promise<readonly SearchHit[]>;

  // ─── Bases de dados ───
  /** Cria uma base (página marcada) no fim das irmãs de `parentId` (`null` = raiz). */
  createDatabase(input: { title: string; parentId: string | null }): Promise<Note>;
  /** As colunas e as linhas ativas da base, com as células preenchidas. */
  getDatabase(id: string): Promise<DatabaseData>;
  addProperty(input: NewProperty): Promise<Property>;
  updateProperty(input: PropertyChange): Promise<Property>;
  deleteProperty(id: string): Promise<void>;
  /** Cria uma linha: uma subpágina nova no fim da base. */
  createRow(input: { databaseId: string; title: string }): Promise<Note>;
  /** Define o valor de uma célula; `null` (ou valor vazio) a esvazia. */
  setCell(input: SetCell): Promise<void>;
  /** Acrescenta uma visão salva (nome e configuração) no fim. */
  addView(input: { databaseId: string; name: string; config: ViewConfig }): Promise<View>;
  /** Renomeia a visão e/ou troca a configuração (o que estiver ausente fica como está). */
  updateView(input: { id: string; name?: string; config?: ViewConfig }): Promise<View>;
  /** Apaga a visão; a última visão de uma base não pode ser apagada. */
  deleteView(id: string): Promise<void>;
  /** Liga, troca ou desliga (`null`) os lembretes de tarefas de uma base; devolve a configuração gravada. */
  setReminders(input: {
    databaseId: string;
    config: ReminderConfig | null;
  }): Promise<ReminderConfig | null>;
  /** As tarefas com prazo nos próximos `days` dias (de 1 a 60), depois de `today`, de bases com lembretes ligados. */
  upcomingTasks(today: string, days: number): Promise<readonly DueTask[]>;
  /** As tarefas atrasadas ou que vencem em `today` (`AAAA-MM-DD`, data local), de bases com lembretes ligados. */
  dueTasks(today: string): Promise<readonly DueTask[]>;
  /** Troca só o título, respeitando a versão (como `update`). */
  renameNote(input: { id: string; title: string; expectedUpdatedAt: number }): Promise<Note>;
}
