import { createContext, useContext } from "react";
import { IconButton } from "./IconButton.tsx";
import { SidebarIcon } from "./icons.tsx";

/**
 * Controles da moldura do app que os módulos precisam usar (por exemplo, o botão que reabre a barra
 * lateral na barra superior de uma página). O app fornece o valor; os módulos só o consomem.
 */
export interface ShellControls {
  readonly sidebarCollapsed: boolean;
  toggleSidebar(): void;
}

const ShellContext = createContext<ShellControls>({
  sidebarCollapsed: false,
  toggleSidebar: () => {},
});

/** O app envolve a tela com isto, passando o estado real da barra lateral. */
export const ShellProvider = ShellContext.Provider;

export function useShell(): ShellControls {
  return useContext(ShellContext);
}

/** Botão que recolhe ou reabre a barra lateral. O rótulo acompanha o estado. */
export function SidebarToggleButton({ className }: { className?: string }) {
  const { sidebarCollapsed, toggleSidebar } = useShell();
  return (
    <IconButton
      label={sidebarCollapsed ? "Abrir a barra lateral" : "Fechar a barra lateral"}
      aria-expanded={!sidebarCollapsed}
      onClick={toggleSidebar}
      {...(className ? { className } : {})}
    >
      <SidebarIcon />
    </IconButton>
  );
}
