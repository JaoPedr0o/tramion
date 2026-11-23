import { lazy } from "react";

/**
 * O editor de blocos é pesado: só é baixado quando uma página é aberta. Fica num arquivo à parte para que
 * o resto do módulo não o importe de forma estática (e os testes não precisem carregá-lo).
 */
export const LazyBlockEditor = lazy(() => import("./BlockEditor.tsx"));
