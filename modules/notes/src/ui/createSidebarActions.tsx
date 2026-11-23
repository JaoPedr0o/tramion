import { ComposeIcon, IconButton, TableIcon } from "@aun/ui";
import type { ComponentType } from "react";
import type { NotesUiDeps } from "./deps.ts";

/** Ícone "nova página" ao lado do nome do espaço de trabalho, no cabeçalho da barra lateral. */
export function createSidebarActions({ actions }: NotesUiDeps): ComponentType {
  return function NotesSidebarActions() {
    return (
      <>
        <IconButton label="Nova página" onClick={() => void actions.createPage(null, [])}>
          <ComposeIcon />
        </IconButton>
        <IconButton
          label="Nova base de dados"
          onClick={() => void actions.createDatabase(null, [])}
        >
          <TableIcon />
        </IconButton>
      </>
    );
  };
}
