import { invoke } from "@tauri-apps/api/core";
import type { NotesGateway } from "../application/notes-gateway.ts";
import type { DatabaseData, DueTask, Property, ReminderConfig, View } from "../domain/database.ts";
import type {
  Note,
  NoteSummary,
  PageGraph,
  PageRef,
  SearchHit,
  TemplateInfo,
  TrashSummary,
  VersionDetail,
  VersionSummary,
} from "../domain/note.ts";
import { toNotesError } from "./notes-error.ts";

/** Chama um comando do plugin Rust (`plugin:notes|<comando>`) e padroniza o erro. */
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(`plugin:notes|${command}`, args);
  } catch (error) {
    throw toNotesError(error);
  }
}

/**
 * Cumpre o contrato chamando o Rust. O Tauri converte `camelCase` (aqui) em `snake_case` (no Rust):
 * `expectedUpdatedAt` chega como `expected_updated_at`.
 */
export function createTauriNotesGateway(): NotesGateway {
  return {
    list: () => call<NoteSummary[]>("list"),
    listTrash: () => call<TrashSummary[]>("list_trash"),
    get: (id) => call<Note>("get", { id }),
    create: ({ title, body, parentId }) =>
      call<Note>("create", { title, body, parentId: parentId ?? null }),
    update: ({ id, title, body, content, expectedUpdatedAt }) =>
      call<Note>("update", { id, title, body, content, expectedUpdatedAt }),
    setPinned: (id, pinned) => call<Note>("set_pinned", { id, pinned }),
    setAppearance: ({ id, icon, cover }) => call<Note>("set_appearance", { id, icon, cover }),
    move: ({ id, newParentId, index }) => call<Note>("move_note", { id, newParentId, index }),
    delete: (id) => call<string[]>("delete", { id }),
    restore: (id) => call<string[]>("restore", { id }),
    purge: (id) => call<string[]>("purge", { id }),
    emptyTrash: () => call<string[]>("empty_trash"),
    listVersions: (noteId) => call<VersionSummary[]>("list_versions", { noteId }),
    getVersion: (versionId) => call<VersionDetail>("get_version", { versionId }),
    restoreVersion: ({ noteId, versionId, expectedUpdatedAt }) =>
      call<Note>("restore_version", { noteId, versionId, expectedUpdatedAt }),
    backlinks: (id) => call<PageRef[]>("backlinks", { id }),
    graph: () => call<PageGraph>("graph"),
    duplicate: (id) => call<string[]>("duplicate_note", { id }),
    listTemplates: () => call<TemplateInfo[]>("list_templates"),
    saveAsTemplate: (noteId) => call<TemplateInfo>("save_as_template", { noteId }),
    deleteTemplate: (templateId) => call<void>("delete_template", { templateId }),
    createFromTemplate: ({ templateId, parentId }) =>
      call<Note>("create_from_template", { templateId, parentId }),
    search: (query, limit) => call<SearchHit[]>("search", { query, limit }),
    createDatabase: ({ title, parentId }) => call<Note>("create_database", { title, parentId }),
    getDatabase: (id) => call<DatabaseData>("get_database", { id }),
    addProperty: ({ databaseId, name, type }) =>
      call<Property>("add_property", { databaseId, name, kind: type }),
    updateProperty: ({ id, name, options }) =>
      call<Property>("update_property", { id, name: name ?? null, options: options ?? null }),
    deleteProperty: (id) => call<void>("delete_property", { id }),
    createRow: ({ databaseId, title }) => call<Note>("create_row", { databaseId, title }),
    setCell: ({ noteId, propertyId, value }) =>
      call<void>("set_cell", { noteId, propertyId, value }),
    addView: ({ databaseId, name, config }) => call<View>("add_view", { databaseId, name, config }),
    updateView: ({ id, name, config }) =>
      call<View>("update_view", { id, name: name ?? null, config: config ?? null }),
    deleteView: (id) => call<void>("delete_view", { id }),
    setReminders: ({ databaseId, config }) =>
      call<ReminderConfig | null>("set_reminders", { databaseId, config }),
    dueTasks: (today) => call<DueTask[]>("due_tasks", { today }),
    upcomingTasks: (today, days) => call<DueTask[]>("upcoming_tasks", { today, days }),
    renameNote: ({ id, title, expectedUpdatedAt }) =>
      call<Note>("rename_note", { id, title, expectedUpdatedAt }),
  };
}
