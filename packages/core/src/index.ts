// API pública do núcleo. Tudo que não é exportado aqui é privado.
export { AppError, type CoreErrorCode } from "./errors.ts";
export { createEventBus, type EventBusOptions } from "./event-bus.ts";
export { createModuleRegistry, type ModuleRegistry } from "./module-registry.ts";
export { createViewRegistry } from "./view-registry.ts";
