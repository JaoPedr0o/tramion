import type { ModuleManifest } from "@aun/contracts";

/**
 * Um "segundo módulo" mínimo, definido AQUI, só para provar que o app aceita outro módulo. Escuta eventos
 * das notas sem importar o módulo de notas (que seria proibido) e registra o que ouviu.
 *
 * `onHeard` recebe cada evento; passe uma função que lança para simular um módulo com defeito.
 */
export function createProbe(onHeard: (event: string, id: string) => void): ModuleManifest {
  return {
    id: "probe",
    version: "0.0.0",
    dependsOn: ["notes"],
    register({ events }) {
      events.on("note.deleted", ({ id }) => onHeard("note.deleted", id));
      events.on("note.purged", ({ id }) => onHeard("note.purged", id));
    },
  };
}
