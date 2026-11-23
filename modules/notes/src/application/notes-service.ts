import type { AppEvents, EventBus } from "@tramion/contracts";
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
  SearchHit,
  SetAppearance,
  TemplateInfo,
  TrashSummary,
  UpdateNote,
} from "../domain/note.ts";
import type { NotesGateway } from "./notes-gateway.ts";

/** Casos de uso do módulo de notas. É o que a interface usa. */
export interface NotesService {
  list(): Promise<readonly NoteSummary[]>;
  listTrash(): Promise<readonly TrashSummary[]>;
  get(id: string): Promise<Note>;
  create(input: NewNote): Promise<Note>;
  update(input: UpdateNote): Promise<Note>;
  setPinned(id: string, pinned: boolean): Promise<Note>;
  move(input: MoveNote): Promise<Note>;
  setAppearance(input: SetAppearance): Promise<Note>;
  /** Devolvem os ids de todas as páginas afetadas (a página e as subpáginas). */
  delete(id: string): Promise<readonly string[]>;
  restore(id: string): Promise<readonly string[]>;
  purge(id: string): Promise<readonly string[]>;
  /** Apaga de vez tudo o que está na lixeira; devolve os ids de todas as páginas apagadas. */
  emptyTrash(): Promise<readonly string[]>;
  /** Duplica a página e a subárvore; devolve os ids criados (a cópia da página escolhida primeiro). */
  duplicate(id: string): Promise<readonly string[]>;
  listTemplates(): Promise<readonly TemplateInfo[]>;
  createFromTemplate(input: { templateId: string; parentId: string | null }): Promise<Note>;
  /** Busca global nas páginas ativas. */
  search(query: string, limit?: number): Promise<readonly SearchHit[]>;

  createDatabase(input: { title: string; parentId: string | null }): Promise<Note>;
  getDatabase(id: string): Promise<DatabaseData>;
  addProperty(input: NewProperty): Promise<Property>;
  updateProperty(input: PropertyChange): Promise<Property>;
  deleteProperty(id: string): Promise<void>;
  createRow(input: { databaseId: string; title: string }): Promise<Note>;
  setCell(input: SetCell): Promise<void>;
  addView(input: { databaseId: string; name: string; config: ViewConfig }): Promise<View>;
  updateView(input: { id: string; name?: string; config?: ViewConfig }): Promise<View>;
  deleteView(id: string): Promise<void>;
  setReminders(input: {
    databaseId: string;
    config: ReminderConfig | null;
  }): Promise<ReminderConfig | null>;
  dueTasks(today: string): Promise<readonly DueTask[]>;
  upcomingTasks(today: string, days: number): Promise<readonly DueTask[]>;
  renameNote(input: { id: string; title: string; expectedUpdatedAt: number }): Promise<Note>;
}

/**
 * Cada operação que muda dados espera o gateway CONFIRMAR e só então publica o evento. Se o gateway
 * rejeitar, o erro sobe intacto e nenhum evento é publicado: quem escuta nunca reage a algo que
 * não aconteceu. As validações (título etc.) são do Rust; aqui não se repetem regras.
 */
export function createNotesService(deps: {
  gateway: NotesGateway;
  events: EventBus<AppEvents>;
}): NotesService {
  const { gateway, events } = deps;

  return {
    list: () => gateway.list(),
    listTrash: () => gateway.listTrash(),
    get: (id) => gateway.get(id),

    async create(input) {
      const note = await gateway.create(input);
      events.emit("note.created", { id: note.id });
      return note;
    },

    async update(input) {
      const note = await gateway.update(input);
      events.emit("note.updated", { id: note.id });
      return note;
    },

    async setPinned(id, pinned) {
      const note = await gateway.setPinned(id, pinned);
      events.emit("note.updated", { id: note.id });
      return note;
    },

    async setAppearance(input) {
      const note = await gateway.setAppearance(input);
      events.emit("note.updated", { id: note.id });
      return note;
    },

    async move(input) {
      const note = await gateway.move(input);
      events.emit("note.moved", { id: note.id });
      return note;
    },

    // Um evento POR PÁGINA AFETADA: excluir uma página com subpáginas afeta várias, e quem escuta
    // (por exemplo, outro módulo que limpa vínculos por id) precisa saber de cada uma.
    // Se nada foi afetado (operação repetida), nenhum evento é publicado.
    async delete(id) {
      const affected = await gateway.delete(id);
      for (const affectedId of affected) events.emit("note.deleted", { id: affectedId });
      return affected;
    },

    async restore(id) {
      const affected = await gateway.restore(id);
      for (const affectedId of affected) events.emit("note.restored", { id: affectedId });
      return affected;
    },

    // Um evento por página criada: duplicar uma página com subpáginas cria várias.
    async duplicate(id) {
      const created = await gateway.duplicate(id);
      for (const createdId of created) events.emit("note.created", { id: createdId });
      return created;
    },

    listTemplates: () => gateway.listTemplates(),

    async createFromTemplate(input) {
      const note = await gateway.createFromTemplate(input);
      events.emit("note.created", { id: note.id });
      return note;
    },

    search: (query, limit = 20) => gateway.search(query, limit),

    // Um evento por página apagada, como em `purge`.
    async emptyTrash() {
      const affected = await gateway.emptyTrash();
      for (const affectedId of affected) events.emit("note.purged", { id: affectedId });
      return affected;
    },

    // Bases de dados: criar uma base ou uma linha cria uma página (`note.created`); trocar o título atualiza a
    // página (`note.updated`). Colunas e células são da própria tela da base: ela se atualiza com o que o
    // gateway devolve, então não há evento para elas.
    async createDatabase(input) {
      const note = await gateway.createDatabase(input);
      events.emit("note.created", { id: note.id });
      return note;
    },

    getDatabase: (id) => gateway.getDatabase(id),
    addProperty: (input) => gateway.addProperty(input),
    updateProperty: (input) => gateway.updateProperty(input),
    deleteProperty: (id) => gateway.deleteProperty(id),

    async createRow(input) {
      const note = await gateway.createRow(input);
      events.emit("note.created", { id: note.id });
      return note;
    },

    setCell: (input) => gateway.setCell(input),
    addView: (input) => gateway.addView(input),
    updateView: (input) => gateway.updateView(input),
    deleteView: (id) => gateway.deleteView(id),

    // Mudar os lembretes de uma base avisa como "página atualizada": quem mostra as tarefas pendentes se recarrega.
    async setReminders(input) {
      const saved = await gateway.setReminders(input);
      events.emit("note.updated", { id: input.databaseId });
      return saved;
    },

    dueTasks: (today) => gateway.dueTasks(today),
    upcomingTasks: (today, days) => gateway.upcomingTasks(today, days),

    async renameNote(input) {
      const note = await gateway.renameNote(input);
      events.emit("note.updated", { id: note.id });
      return note;
    },

    async purge(id) {
      const affected = await gateway.purge(id);
      for (const affectedId of affected) events.emit("note.purged", { id: affectedId });
      return affected;
    },
  };
}
