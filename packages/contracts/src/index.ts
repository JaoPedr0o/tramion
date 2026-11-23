// Contratos compartilhados: SOMENTE tipos e interfaces, nenhuma lógica.
// É a "língua comum" entre core, módulos e infraestrutura.
import type { ComponentType } from "react";
import type { NotesEvents } from "./events/notes.ts";

export type { NotesEvents } from "./events/notes.ts";

/** Função que cancela uma assinatura. */
export type Unsubscribe = () => void;

/**
 * Catálogo de eventos da aplicação: nome do evento → formato do conteúdo.
 * É a união dos eventos de cada módulo (um arquivo por módulo em `events/`). Ao criar eventos num
 * módulo novo, componha aqui: `type AppEvents = NotesEvents & TasksEvents;`
 */
export type AppEvents = NotesEvents;

/** Barramento de eventos tipado. A implementação vive em @tramion/core. */
export interface EventBus<E extends object> {
  /** Escuta um evento. Devolve a função que cancela a assinatura. */
  on<K extends keyof E & string>(name: K, handler: (payload: E[K]) => void): Unsubscribe;
  /** Publica um evento. Os assinantes são chamados de forma síncrona, na ordem de assinatura. */
  emit<K extends keyof E & string>(name: K, payload: E[K]): void;
}

/**
 * Uma tela que um módulo oferece. O app monta a MOLDURA (barra lateral, barra superior e área principal)
 * e cada módulo preenche os espaços, sem que o app conheça o módulo.
 */
export interface ViewContribution {
  /** Identificador único da tela, por exemplo "notes". */
  readonly id: string;
  /** Nome da tela; aparece na barra lateral quando há mais de uma tela. */
  readonly title: string;
  /** Ícones de ação ao lado do nome do espaço de trabalho (por exemplo, "nova página"). */
  readonly sidebarActions?: ComponentType;
  /** Conteúdo da barra lateral (por exemplo, a árvore de páginas). */
  readonly sidebar?: ComponentType;
  /** Conteúdo da barra superior (por exemplo, caminho e ações da página). */
  readonly topbar?: ComponentType;
  /** Conteúdo da área principal. */
  readonly main: ComponentType;
}

/** Onde os módulos registram suas telas. A implementação vive em @tramion/core. */
export interface ViewRegistry {
  register(view: ViewContribution): void;
  list(): readonly ViewContribution[];
}

/** O que o app entrega a cada módulo no momento do registro. */
export interface ModuleContext {
  readonly events: EventBus<AppEvents>;
  readonly views: ViewRegistry;
}

/** Descrição de um módulo: é o que o app lê para ligá-lo ao sistema. */
export interface ModuleManifest {
  /** Identificador único e estável, por exemplo "notes". */
  readonly id: string;
  readonly version: string;
  /** Ids de módulos que precisam ser registrados antes deste. */
  readonly dependsOn?: readonly string[];
  /** Chamado uma vez, na inicialização, depois das dependências. */
  register(context: ModuleContext): void;
}
