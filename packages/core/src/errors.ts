/** Códigos de erro do núcleo. Strings estáveis: podem ser testadas e exibidas. */
export type CoreErrorCode =
  | "module.duplicate"
  | "module.missing-dependency"
  | "module.dependency-cycle"
  | "module.register-failed"
  | "module.registry-already-started";

/** Erro conhecido da aplicação: carrega um código estável e, opcionalmente, a causa original. */
export class AppError<C extends string = CoreErrorCode> extends Error {
  readonly code: C;

  constructor(code: C, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
  }
}
