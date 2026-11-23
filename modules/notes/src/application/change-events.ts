/** Eventos que significam "a página foi mudada pela pessoa": o que dispara a sincronização depois de uma pausa. */
export const EDIT_EVENTS = [
  "note.created",
  "note.updated",
  "note.moved",
  "note.deleted",
  "note.restored",
  "note.purged",
] as const;

/**
 * Eventos depois dos quais listas e páginas devem recarregar: as edições da pessoa e a chegada de alterações de outro
 * aparelho. Fica num lugar só para nenhuma tela esquecer um deles.
 */
export const CHANGE_EVENTS = [...EDIT_EVENTS, "notes.synced"] as const;
