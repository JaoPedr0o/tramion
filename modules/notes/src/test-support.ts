// Auxiliares SÓ para testes (não fazem parte da API pública do módulo).
import { vi } from "vitest";
import type { NotesGateway } from "./application/notes-gateway.ts";
import { NotesError } from "./domain/errors.ts";
import type {
  CellValue,
  DatabaseData,
  DueTask,
  Property,
  PropertyType,
  ReminderConfig,
  View,
  ViewConfig,
} from "./domain/database.ts";
import type { Note, NoteSummary, TrashSummary } from "./domain/note.ts";

export function aNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "n1",
    title: "Título",
    body: "",
    content: "[]",
    pinned: false,
    icon: null,
    cover: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    parentId: null,
    position: 0,
    ...overrides,
  };
}

export function aSummary(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: "n1",
    title: "Título",
    pinned: false,
    updatedAt: 1,
    deletedAt: null,
    parentId: null,
    position: 0,
    icon: null,
    isDatabase: false,
    ...overrides,
  };
}

/** Gateway falso: cada método é um `vi.fn()` que, por padrão, dá certo. Sobrescreva o que precisar. */
export function gatewayStub(overrides: Partial<NotesGateway> = {}): NotesGateway {
  return {
    list: vi.fn(async () => []),
    listTrash: vi.fn(async () => []),
    get: vi.fn(async () => aNote()),
    create: vi.fn(async () => aNote()),
    update: vi.fn(async () => aNote()),
    setPinned: vi.fn(async () => aNote()),
    move: vi.fn(async () => aNote()),
    setAppearance: vi.fn(async () => aNote()),
    delete: vi.fn(async () => []),
    restore: vi.fn(async () => []),
    purge: vi.fn(async () => []),
    emptyTrash: vi.fn(async () => []),
    search: vi.fn(async () => []),
    listVersions: vi.fn(async () => []),
    getVersion: vi.fn(async () => {
      throw new Error("getVersion não configurado no stub");
    }),
    restoreVersion: vi.fn(async () => aNote()),
    backlinks: vi.fn(async () => []),
    graph: vi.fn(async () => ({ nodes: [], edges: [] })),
    duplicate: vi.fn(async () => []),
    listTemplates: vi.fn(async () => []),
    createFromTemplate: vi.fn(async () => aNote()),
    createDatabase: vi.fn(async () => aNote()),
    getDatabase: vi.fn(async () => ({
      id: "n1",
      title: "Base",
      properties: [],
      views: [],
      reminders: null,
      rows: [],
    })),
    addProperty: vi.fn(async () => {
      throw new Error("addProperty não configurado no stub");
    }),
    updateProperty: vi.fn(async () => {
      throw new Error("updateProperty não configurado no stub");
    }),
    deleteProperty: vi.fn(async () => {}),
    createRow: vi.fn(async () => aNote()),
    setCell: vi.fn(async () => {}),
    addView: vi.fn(async () => {
      throw new Error("addView não configurado no stub");
    }),
    updateView: vi.fn(async () => {
      throw new Error("updateView não configurado no stub");
    }),
    deleteView: vi.fn(async () => {}),
    setReminders: vi.fn(async () => null),
    dueTasks: vi.fn(async () => []),
    upcomingTasks: vi.fn(async () => []),
    renameNote: vi.fn(async () => aNote()),
    ...overrides,
  };
}

/**
 * Gateway em memória que imita as regras do Rust: conflito de versão, hierarquia (pai, posição, mover
 * sem ciclos) e lixeira de subárvores (mesmo instante de exclusão). Existe para testar a interface sem
 * o app. ATENÇÃO: é uma IMITAÇÃO; se o Rust mudar, este arquivo precisa acompanhar. A prova de verdade
 * é rodar o app.
 */
export function createFakeGateway() {
  let seq = 0;
  let clock = 1_000;
  const notes = new Map<string, Note>();
  const versions = new Map<string, Array<{ id: string; noteId: string; note: Note; at: number }>>();
  const databases = new Set<string>();
  const properties = new Map<string, Property>();
  const cells = new Map<string, CellValue>(); // chave: `${linha}|${coluna}`
  const views = new Map<string, View>();
  const reminders = new Map<string, ReminderConfig>();
  const tick = () => ++clock;

  const summary = (n: Note): NoteSummary => ({
    id: n.id,
    title: n.title,
    pinned: n.pinned,
    updatedAt: n.updatedAt,
    deletedAt: n.deletedAt,
    parentId: n.parentId,
    position: n.position,
    icon: n.icon,
    isDatabase: databases.has(n.id),
  });
  const must = (id: string): Note => {
    const note = notes.get(id);
    if (!note) throw new NotesError("notes.not-found", "não existe");
    return note;
  };
  const cleanTitle = (title: string): string => {
    const trimmed = title.trim();
    if (!trimmed) throw new NotesError("notes.title-empty", "vazio");
    return trimmed;
  };
  const byPosition = (a: Note, b: Note) =>
    a.position - b.position || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
  const activeChildren = (parentId: string | null): Note[] =>
    [...notes.values()]
      .filter((n) => n.deletedAt === null && n.parentId === parentId)
      .sort(byPosition);
  const descendants = (id: string): string[] => {
    const found: string[] = [];
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const n of notes.values()) {
        if (n.parentId === current) {
          found.push(n.id);
          queue.push(n.id);
        }
      }
    }
    return found;
  };
  const renumber = (parentId: string | null, ids: string[]) =>
    ids.forEach((id, position) => notes.set(id, { ...notes.get(id)!, parentId, position }));
  const ensureActiveParent = (parentId: string | null) => {
    if (parentId === null) return;
    const parent = notes.get(parentId);
    if (!parent) throw new NotesError("notes.parent-not-found", "destino não existe");
    if (parent.deletedAt !== null)
      throw new NotesError("notes.parent-in-trash", "destino na lixeira");
  };

  type DatabaseMethod =
    | "createDatabase"
    | "getDatabase"
    | "addProperty"
    | "updateProperty"
    | "deleteProperty"
    | "createRow"
    | "setCell"
    | "addView"
    | "updateView"
    | "deleteView"
    | "setReminders"
    | "dueTasks"
    | "upcomingTasks"
    | "renameNote";
  const gateway: Omit<NotesGateway, DatabaseMethod> = {
    async list() {
      return [...notes.values()]
        .filter((n) => n.deletedAt === null)
        .sort(
          (a, b) =>
            Number(a.parentId !== null) - Number(b.parentId !== null) ||
            (a.parentId ?? "").localeCompare(b.parentId ?? "") ||
            byPosition(a, b),
        )
        .map(summary);
    },

    async listTrash(): Promise<readonly TrashSummary[]> {
      const trashed = [...notes.values()]
        .filter((n) => n.deletedAt !== null)
        .sort((a, b) => b.deletedAt! - a.deletedAt! || a.id.localeCompare(b.id));
      // Raiz de uma exclusão: sobe pela cadeia de pais com o MESMO instante de exclusão.
      const rootOf = (note: Note): Note => {
        let current = note;
        for (;;) {
          const parent = current.parentId ? notes.get(current.parentId) : undefined;
          if (!parent || parent.deletedAt === null || parent.deletedAt !== current.deletedAt)
            return current;
          current = parent;
        }
      };
      const counts = new Map<string, number>();
      for (const note of trashed) {
        const root = rootOf(note);
        if (root.id !== note.id) counts.set(root.id, (counts.get(root.id) ?? 0) + 1);
      }
      return trashed
        .filter((note) => rootOf(note).id === note.id)
        .map((note) => ({
          id: note.id,
          title: note.title,
          deletedAt: note.deletedAt!,
          descendantCount: counts.get(note.id) ?? 0,
        }));
    },

    async get(id) {
      return must(id);
    },

    async create({ title, body, parentId = null }) {
      const clean = cleanTitle(title);
      ensureActiveParent(parentId);
      const at = tick();
      const siblings = activeChildren(parentId);
      const note: Note = {
        id: `n${++seq}`,
        title: clean,
        body,
        content: "[]",
        pinned: false,
        icon: null,
        cover: null,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
        parentId,
        position: siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.position)) + 1,
      };
      notes.set(note.id, note);
      return note;
    },

    async update({ id, title, body, content, expectedUpdatedAt }) {
      const note = must(id);
      const changed = note.title !== title.trim() || note.content !== content;
      if (
        changed &&
        note.deletedAt === null &&
        note.updatedAt === expectedUpdatedAt &&
        (note.content !== "[]" || note.body !== "")
      ) {
        const list = versions.get(id) ?? [];
        list.unshift({ id: `ver${++seq}`, noteId: id, note, at: note.updatedAt });
        versions.set(id, list);
      }
      const clean = cleanTitle(title);
      if (note.deletedAt !== null) throw new NotesError("notes.in-trash", "lixeira");
      if (note.updatedAt !== expectedUpdatedAt) throw new NotesError("notes.conflict", "mudou");
      const next = { ...note, title: clean, body, content, updatedAt: tick() };
      notes.set(id, next);
      return next;
    },

    async setPinned(id, pinned) {
      const note = must(id);
      if (note.deletedAt !== null) throw new NotesError("notes.in-trash", "lixeira");
      const next = { ...note, pinned };
      notes.set(id, next);
      return next;
    },

    async setAppearance({ id, icon, cover }) {
      const note = must(id);
      if (note.deletedAt !== null) throw new NotesError("notes.in-trash", "lixeira");
      if (icon !== null && icon.trim() === "") throw new NotesError("notes.icon-invalid", "ícone");
      const coverOk =
        /^(color:#[0-9a-fA-F]{6}|gradient:[a-z0-9-]{1,32}|image:(https?|asset):\/\/\S+)$/;
      if (cover !== null && !coverOk.test(cover))
        throw new NotesError("notes.cover-invalid", "capa");
      const next = { ...note, icon: icon === null ? null : icon.trim(), cover };
      notes.set(id, next);
      return next;
    },

    async move({ id, newParentId, index }) {
      const note = must(id);
      if (note.deletedAt !== null) throw new NotesError("notes.in-trash", "lixeira");
      ensureActiveParent(newParentId);
      if (newParentId !== null && (newParentId === id || descendants(id).includes(newParentId))) {
        throw new NotesError("notes.cycle", "ciclo");
      }
      const destination = activeChildren(newParentId)
        .map((n) => n.id)
        .filter((other) => other !== id);
      destination.splice(Math.min(index, destination.length), 0, id);
      const oldParentId = note.parentId;
      renumber(newParentId, destination);
      if (oldParentId !== newParentId) {
        renumber(
          oldParentId,
          activeChildren(oldParentId).map((n) => n.id),
        );
      }
      return notes.get(id)!;
    },

    async delete(id) {
      const note = must(id);
      if (note.deletedAt !== null) return [];
      const stamp = tick();
      const affected = [id, ...descendants(id)].filter(
        (other) => notes.get(other)!.deletedAt === null,
      );
      for (const other of affected) notes.set(other, { ...notes.get(other)!, deletedAt: stamp });
      return affected;
    },

    async restore(id) {
      const note = must(id);
      const stamp = note.deletedAt;
      if (stamp === null) return [];
      const parent = note.parentId ? notes.get(note.parentId) : undefined;
      const newParentId = parent && parent.deletedAt === null ? parent.id : null;
      const siblings = activeChildren(newParentId);
      notes.set(id, {
        ...note,
        deletedAt: null,
        parentId: newParentId,
        position: siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.position)) + 1,
      });
      const affected = [id];
      const queue = [id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const n of notes.values()) {
          if (n.parentId === current && n.deletedAt === stamp) {
            notes.set(n.id, { ...n, deletedAt: null });
            affected.push(n.id);
            queue.push(n.id);
          }
        }
      }
      return affected;
    },

    async listVersions(noteId) {
      must(noteId);
      return (versions.get(noteId) ?? []).map(({ id, note, at }) => ({
        id,
        title: note.title,
        preview: note.body.split(/\s+/).join(" ").slice(0, 160),
        savedAt: at,
      }));
    },

    async getVersion(versionId) {
      for (const list of versions.values()) {
        const found = list.find((v) => v.id === versionId);
        if (found)
          return {
            id: found.id,
            title: found.note.title,
            body: found.note.body,
            savedAt: found.at,
          };
      }
      throw new NotesError("notes.not-found", "versão");
    },

    async restoreVersion({ noteId, versionId, expectedUpdatedAt }) {
      const found = (versions.get(noteId) ?? []).find((v) => v.id === versionId);
      if (!found) throw new NotesError("notes.not-found", "versão");
      return gateway.update({
        id: noteId,
        title: found.note.title,
        body: found.note.body,
        content: found.note.content,
        expectedUpdatedAt,
      });
    },

    async backlinks(id) {
      return [...notes.values()]
        .filter((n) => n.deletedAt === null && n.id !== id && referencesIn(n.content).includes(id))
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((n) => ({ id: n.id, title: n.title, icon: n.icon, isDatabase: databases.has(n.id) }));
    },

    async graph() {
      const alive = [...notes.values()].filter((n) => n.deletedAt === null);
      const rowIds = new Set(
        alive.filter((n) => n.parentId && databases.has(n.parentId)).map((n) => n.id),
      );
      const nodes = alive.filter((n) => !rowIds.has(n.id));
      const ids = new Set(nodes.map((n) => n.id));
      const edges: Array<{ from: string; to: string; kind: "link" | "child" }> = [];
      for (const n of nodes)
        if (n.parentId && ids.has(n.parentId))
          edges.push({ from: n.parentId, to: n.id, kind: "child" });
      for (const n of nodes) {
        for (const target of referencesIn(n.content)) {
          const isChild = notes.get(target)?.parentId === n.id;
          if (target !== n.id && ids.has(target) && !isChild)
            edges.push({ from: n.id, to: target, kind: "link" });
        }
      }
      return {
        nodes: nodes.map((n) => ({
          id: n.id,
          title: n.title,
          icon: n.icon,
          isDatabase: databases.has(n.id),
        })),
        edges,
      };
    },

    async duplicate(id) {
      const root = must(id);
      if (root.deletedAt !== null) throw new NotesError("notes.in-trash", "lixeira");
      // Subárvore ativa, pais antes das filhas (imitação: copia páginas; as regras de bases são testadas no Rust).
      const order: Note[] = [root];
      for (let index = 0; index < order.length; index++) {
        order.push(...activeChildren(order[index]!.id));
      }
      const ids = new Map<string, string>();
      const created: string[] = [];
      for (const old of order) {
        const isRoot = old.id === id;
        const parentId = isRoot ? old.parentId : (ids.get(old.parentId!) ?? null);
        const copy = await gateway.create({
          title: isRoot ? `Cópia de ${old.title}`.slice(0, 200) : old.title,
          body: old.body,
          parentId,
        });
        ids.set(old.id, copy.id);
        created.push(copy.id);
      }
      for (const old of order) {
        const copy = notes.get(ids.get(old.id)!)!;
        let content = old.content;
        for (const [from, to] of ids) content = content.split(from).join(to);
        notes.set(copy.id, { ...copy, content, icon: old.icon, cover: old.cover });
        if (databases.has(old.id)) databases.add(copy.id);
      }
      return created;
    },

    async listTemplates() {
      return [
        { id: "meeting", name: "Notas de reunião", icon: "🗒️", description: "Pauta e decisões" },
        { id: "journal", name: "Entrada de diário", icon: "📓", description: "Um espaço livre" },
      ];
    },

    async createFromTemplate({ templateId, parentId }) {
      const template = (await this.listTemplates()).find((t) => t.id === templateId);
      if (!template) throw new NotesError("notes.not-found", "modelo");
      const note = await gateway.create({ title: template.name, body: "", parentId });
      const next = { ...note, icon: template.icon };
      notes.set(note.id, next);
      return next;
    },

    async search(query, limit) {
      const fold = (text: string) =>
        text
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
      const words = fold(query).split(/\s+/).filter(Boolean);
      if (words.length === 0) return [];
      const hits = [...notes.values()]
        .filter((n) => n.deletedAt === null)
        .map((n) => {
          const title = fold(n.title);
          const body = fold(n.body);
          const all = words.every((w) => title.includes(w) || body.includes(w));
          const inTitle = words.every((w) => title.includes(w));
          return { n, all, inTitle };
        })
        .filter((entry) => entry.all)
        .sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || b.n.updatedAt - a.n.updatedAt)
        .slice(0, Math.max(1, Math.min(limit, 50)));
      return hits.map(({ n, inTitle }) => ({
        id: n.id,
        title: n.title,
        icon: n.icon,
        isDatabase: databases.has(n.id),
        snippet: n.body.slice(0, 80),
        inTitle,
      }));
    },

    async emptyTrash() {
      const affected = [...notes.values()].filter((n) => n.deletedAt !== null).map((n) => n.id);
      for (const id of affected) {
        notes.delete(id);
        databases.delete(id);
      }
      for (const [propertyId, property] of [...properties]) {
        if (!notes.has(property.databaseId)) properties.delete(propertyId);
      }
      for (const [viewId, view] of [...views]) {
        if (!notes.has(view.databaseId)) views.delete(viewId);
      }
      for (const databaseId of [...reminders.keys()]) {
        if (!notes.has(databaseId)) reminders.delete(databaseId);
      }
      for (const key of [...cells.keys()]) {
        const [rowId, propertyId] = key.split("|");
        if (!notes.has(rowId!) || !properties.has(propertyId!)) cells.delete(key);
      }
      return affected;
    },

    async purge(id) {
      const note = must(id);
      if (note.deletedAt === null) throw new NotesError("notes.not-in-trash", "ativa");
      const affected = [id, ...descendants(id)].filter(
        (other) => notes.get(other)!.deletedAt !== null,
      );
      for (const other of affected) notes.delete(other);
      return affected;
    },
  };

  // ─── Bases de dados (imitação simplificada: as regras de verdade e seus testes estão no Rust) ───
  const mustDatabase = (id: string): Note => {
    const note = must(id);
    if (note.deletedAt !== null) throw new NotesError("notes.in-trash", "lixeira");
    if (!databases.has(id)) throw new NotesError("notes.not-database", "não é base");
    return note;
  };
  const mustProperty = (id: string): Property => {
    const property = properties.get(id);
    if (!property) throw new NotesError("notes.property-not-found", "coluna");
    return property;
  };
  const cellKey = (noteId: string, propertyId: string) => `${noteId}|${propertyId}`;
  const isEmpty = (value: CellValue | null) =>
    value === null || value === "" || (Array.isArray(value) && value.length === 0);
  const fits = (type: PropertyType, value: CellValue, optionIds: Set<string>): boolean => {
    switch (type) {
      case "text":
      case "url":
        return typeof value === "string";
      case "date":
        return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
      case "number":
        return typeof value === "number";
      case "checkbox":
        return typeof value === "boolean";
      case "select":
        return typeof value === "string" && optionIds.has(value);
      case "multi_select":
        return (
          Array.isArray(value) && value.every((id) => typeof id === "string" && optionIds.has(id))
        );
    }
  };

  /** Ids de páginas citados no conteúdo (menções e subpáginas), como `extract_references` do Rust. */
  const referencesIn = (content: string): string[] => {
    const found: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") {
        const object = value as { type?: unknown; props?: { pageId?: unknown } };
        if (
          (object.type === "childPage" || object.type === "mention") &&
          typeof object.props?.pageId === "string"
        ) {
          if (!found.includes(object.props.pageId)) found.push(object.props.pageId);
        }
        Object.values(object).forEach(walk);
      }
    };
    try {
      walk(JSON.parse(content));
    } catch {
      /* conteúdo ilegível: nada citado */
    }
    return found;
  };

  /** Imita a varredura de tarefas do Rust: bases com lembretes ligados, linhas ativas, não concluídas. */
  const scanTasks = (accept: (date: string) => boolean, overdue: (date: string) => boolean) => {
    const found: DueTask[] = [];
    for (const [databaseId, config] of reminders) {
      const base = notes.get(databaseId);
      if (!config.enabled || !base || base.deletedAt !== null) continue;
      for (const row of activeChildren(databaseId)) {
        const date = cells.get(cellKey(row.id, config.dateProperty));
        if (typeof date !== "string" || !accept(date)) continue;
        const mark = config.doneProperty
          ? cells.get(cellKey(row.id, config.doneProperty))
          : undefined;
        const finished = config.doneOption === null ? mark === true : mark === config.doneOption;
        if (finished) continue;
        found.push({
          id: row.id,
          title: row.title,
          icon: row.icon,
          databaseId,
          databaseTitle: base.title,
          date,
          overdue: overdue(date),
        });
      }
    }
    return found.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  };

  const databaseGateway: Pick<NotesGateway, DatabaseMethod> = {
    async createDatabase({ title, parentId }) {
      const note = await gateway.create({ title, body: "", parentId });
      databases.add(note.id);
      const view: View = {
        id: `v${++seq}`,
        databaseId: note.id,
        name: "Tabela",
        config: { mode: "table", filters: [], sort: null },
        position: 0,
      };
      views.set(view.id, view);
      return note;
    },

    async getDatabase(id): Promise<DatabaseData> {
      const base = mustDatabase(id);
      return {
        id,
        title: base.title,
        properties: [...properties.values()]
          .filter((p) => p.databaseId === id)
          .sort((a, b) => a.position - b.position),
        views: [...views.values()]
          .filter((v) => v.databaseId === id)
          .sort((a, b) => a.position - b.position),
        reminders: reminders.get(id) ?? null,
        rows: activeChildren(id).map((row) => ({
          id: row.id,
          title: row.title,
          icon: row.icon,
          updatedAt: row.updatedAt,
          cells: Object.fromEntries(
            [...properties.values()]
              .filter((p) => p.databaseId === id && cells.has(cellKey(row.id, p.id)))
              .map((p) => [p.id, cells.get(cellKey(row.id, p.id))!]),
          ),
        })),
      };
    },

    async addProperty({ databaseId, name, type }) {
      mustDatabase(databaseId);
      const clean = name.trim();
      if (!clean) throw new NotesError("notes.property-invalid", "nome");
      const own = [...properties.values()].filter((p) => p.databaseId === databaseId);
      const property: Property = {
        id: `p${++seq}`,
        databaseId,
        name: clean,
        type,
        options: [],
        position: own.length === 0 ? 0 : Math.max(...own.map((p) => p.position)) + 1,
      };
      properties.set(property.id, property);
      return property;
    },

    async updateProperty({ id, name, options }) {
      const current = mustProperty(id);
      if (options !== undefined && current.type !== "select" && current.type !== "multi_select") {
        throw new NotesError("notes.property-invalid", "sem opções");
      }
      const cleanName = name === undefined ? current.name : name.trim();
      if (!cleanName) throw new NotesError("notes.property-invalid", "nome");
      const next: Property = { ...current, name: cleanName, options: options ?? current.options };
      properties.set(id, next);
      if (options !== undefined) {
        const kept = new Set(options.map((o) => o.id));
        for (const [key, value] of [...cells]) {
          if (!key.endsWith(`|${id}`)) continue;
          if (Array.isArray(value)) {
            const remaining = value.filter((optionId) => kept.has(optionId));
            if (remaining.length === 0) cells.delete(key);
            else cells.set(key, remaining);
          } else if (typeof value === "string" && !kept.has(value)) {
            cells.delete(key);
          }
        }
      }
      return next;
    },

    async deleteProperty(id) {
      mustProperty(id);
      properties.delete(id);
      for (const key of [...cells.keys()]) if (key.endsWith(`|${id}`)) cells.delete(key);
    },

    async createRow({ databaseId, title }) {
      mustDatabase(databaseId);
      return gateway.create({ title, body: "", parentId: databaseId });
    },

    async setCell({ noteId, propertyId, value }) {
      const property = mustProperty(propertyId);
      mustDatabase(property.databaseId);
      const row = must(noteId);
      if (row.deletedAt !== null) throw new NotesError("notes.in-trash", "lixeira");
      if (row.parentId !== property.databaseId) throw new NotesError("notes.cell-invalid", "linha");
      if (isEmpty(value)) {
        cells.delete(cellKey(noteId, propertyId));
        return;
      }
      if (!fits(property.type, value!, new Set(property.options.map((o) => o.id)))) {
        throw new NotesError("notes.cell-invalid", "valor");
      }
      cells.set(cellKey(noteId, propertyId), value!);
    },

    async addView({ databaseId, name, config }) {
      mustDatabase(databaseId);
      const clean = name.trim();
      if (!clean) throw new NotesError("notes.view-invalid", "nome");
      const own = [...views.values()].filter((v) => v.databaseId === databaseId);
      if (own.length >= 20) throw new NotesError("notes.limit-reached", "limite");
      const view: View = {
        id: `v${++seq}`,
        databaseId,
        name: clean,
        config: config as ViewConfig,
        position: own.length === 0 ? 0 : Math.max(...own.map((v) => v.position)) + 1,
      };
      views.set(view.id, view);
      return view;
    },

    async updateView({ id, name, config }) {
      const current = views.get(id);
      if (!current) throw new NotesError("notes.view-not-found", "visão");
      mustDatabase(current.databaseId);
      const cleanName = name === undefined ? current.name : name.trim();
      if (!cleanName) throw new NotesError("notes.view-invalid", "nome");
      const next: View = { ...current, name: cleanName, config: config ?? current.config };
      views.set(id, next);
      return next;
    },

    async deleteView(id) {
      const current = views.get(id);
      if (!current) throw new NotesError("notes.view-not-found", "visão");
      mustDatabase(current.databaseId);
      if ([...views.values()].filter((v) => v.databaseId === current.databaseId).length <= 1) {
        throw new NotesError("notes.view-invalid", "última visão");
      }
      views.delete(id);
    },

    async setReminders({ databaseId, config }) {
      mustDatabase(databaseId);
      if (config === null) {
        reminders.delete(databaseId);
        return null;
      }
      const own = (id: string | null) => {
        const property = id === null ? undefined : properties.get(id);
        return property && property.databaseId === databaseId ? property : undefined;
      };
      const date = own(config.dateProperty);
      if (date?.type !== "date") throw new NotesError("notes.property-invalid", "prazo");
      const done = own(config.doneProperty);
      if (config.doneProperty !== null && !done)
        throw new NotesError("notes.property-invalid", "conclusão");
      if (done && done.type !== "checkbox" && done.type !== "select") {
        throw new NotesError("notes.property-invalid", "tipo");
      }
      if (done?.type === "select" && !done.options.some((o) => o.id === config.doneOption)) {
        throw new NotesError("notes.property-invalid", "opção");
      }
      const clean: ReminderConfig = {
        enabled: config.enabled,
        dateProperty: config.dateProperty,
        doneProperty: config.doneProperty,
        doneOption: done?.type === "select" ? config.doneOption : null,
      };
      reminders.set(databaseId, clean);
      return clean;
    },

    async dueTasks(today) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new NotesError("notes.cell-invalid", "data");
      return scanTasks(
        (date) => date <= today,
        (date) => date < today,
      );
    },

    async upcomingTasks(today, days) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new NotesError("notes.cell-invalid", "data");
      const [y, m, d] = today.split("-").map(Number) as [number, number, number];
      const limit = Math.max(1, Math.min(60, days));
      const end = new Date(Date.UTC(y, m - 1, d + limit)).toISOString().slice(0, 10);
      return scanTasks(
        (date) => date > today && date <= end,
        () => false,
      );
    },

    async renameNote({ id, title, expectedUpdatedAt }) {
      const note = must(id);
      const clean = cleanTitle(title);
      if (note.deletedAt !== null) throw new NotesError("notes.in-trash", "lixeira");
      if (note.updatedAt !== expectedUpdatedAt) throw new NotesError("notes.conflict", "mudou");
      const next = { ...note, title: clean, updatedAt: tick() };
      notes.set(id, next);
      return next;
    },
  };
  const fullGateway: NotesGateway = { ...gateway, ...databaseGateway };

  return {
    gateway: fullGateway,
    notes,
    /** Simula uma edição vinda de outro lugar (outra janela, por exemplo): muda a nota e a versão. */
    touch(id: string, patch: Partial<Pick<Note, "title" | "body">>) {
      notes.set(id, { ...must(id), ...patch, updatedAt: tick() });
    },
  };
}
