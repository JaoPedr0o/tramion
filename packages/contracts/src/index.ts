// Contratos compartilhados: SOMENTE tipos e interfaces, nenhuma lógica.
// É a "língua comum" entre core, módulos e infraestrutura.
import type { ComponentType } from "react";

/** Função que cancela uma assinatura. */
export type Unsubscribe = () => void;

/**
 * Catálogo de eventos da aplicação: nome do evento → formato do conteúdo.
 * Cada módulo que publica eventos adiciona os seus aqui (em arquivos próprios deste
 * pacote), para que outros módulos possam escutá-los sem importar o módulo que os publica.
 * Vazio por enquanto: o primeiro evento chega com o módulo de notas.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AppEvents {}

/** Barramento de eventos tipado. A implementação vive em @aun/core. */
export interface EventBus<E extends object> {
  /** Escuta um evento. Devolve a função que cancela a assinatura. */
  on<K extends keyof E & string>(name: K, handler: (payload: E[K]) => void): Unsubscribe;
  /** Publica um evento. Os assinantes são chamados de forma síncrona, na ordem de assinatura. */
  emit<K extends keyof E & string>(name: K, payload: E[K]): void;
}

/** Uma tela que um módulo oferece. O app a lista na barra lateral, sem conhecer o módulo. */
export interface ViewContribution {
  /** Identificador único da tela, por exemplo "notes". */
  readonly id: string;
  /** Texto exibido na barra lateral. */
  readonly title: string;
  readonly component: ComponentType;
}

/** Onde os módulos registram suas telas. A implementação vive em @aun/core. */
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
