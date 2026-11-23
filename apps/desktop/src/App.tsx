import type { ViewRegistry } from "@aesthetic/contracts";
import {
  Menu,
  MonitorIcon,
  MoonIcon,
  ShellProvider,
  SidebarToggleButton,
  SunIcon,
  type MenuItem,
  Logo,
} from "@aesthetic/ui";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { applyTheme, readTheme, saveTheme, type ThemePreference } from "./theme";

const STORAGE_KEY = "aesthetic.sidebarCollapsed";
/** Chave do nome antigo do app: a preferência de quem já usava continua valendo. */
const LEGACY_STORAGE_KEY = "aun.sidebarCollapsed";

// O armazenamento do navegador pode faltar (janela privada, dados bloqueados): nesse caso o app só
// deixa de lembrar o estado da barra lateral, sem quebrar.
function readCollapsed(): boolean {
  try {
    return (localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)) === "1";
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    /* sem armazenamento: não lembra */
  }
}

const THEMES: ReadonlyArray<{ id: ThemePreference; label: string; icon: ReactElement }> = [
  { id: "light", label: "Claro", icon: <SunIcon /> },
  { id: "dark", label: "Escuro", icon: <MoonIcon /> },
  { id: "system", label: "Automático (do sistema)", icon: <MonitorIcon /> },
];

interface Props {
  views: ViewRegistry;
  workspaceName?: string;
}

/**
 * Moldura do app (a "casca"): barra lateral recolhível, barra superior e área principal. Os módulos
 * preenchem os espaços; a casca só cuida da disposição e do recolher/abrir da barra lateral.
 */
export default function App({ views, workspaceName = "Aesthetic Notes" }: Props) {
  const available = views.list();
  const [selectedId, setSelectedId] = useState(available[0]?.id);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [theme, setTheme] = useState(readTheme);

  const toggleSidebar = useCallback(() => setCollapsed((previous) => !previous), []);
  useEffect(() => saveCollapsed(collapsed), [collapsed]);
  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  // Ctrl+\ recolhe e abre a barra lateral, como no Notion.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key === "\\") {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  const controls = useMemo(
    () => ({ sidebarCollapsed: collapsed, toggleSidebar }),
    [collapsed, toggleSidebar],
  );

  const view = available.find((candidate) => candidate.id === selectedId) ?? available[0];
  const SidebarActions = view?.sidebarActions;
  const Sidebar = view?.sidebar;
  const Topbar = view?.topbar;
  const Main = view?.main;

  return (
    <ShellProvider value={controls}>
      <div className="shell" data-sidebar={collapsed ? "collapsed" : "open"}>
        {/* `inert` tira a barra recolhida da ordem do Tab e dos leitores de tela. */}
        <aside className="shell__sidebar" aria-label="Barra lateral" inert={collapsed}>
          <div className="shell__workspace">
            <span className="shell__avatar" aria-hidden="true">
              <Logo size={22} />
            </span>
            <span className="shell__workspace-name">{workspaceName}</span>
            {SidebarActions && <SidebarActions />}
            <SidebarToggleButton />
          </div>

          {available.length > 1 && (
            <nav className="shell__views" aria-label="Telas">
              {available.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className="shell__view"
                  aria-current={candidate.id === view?.id ? "page" : undefined}
                  onClick={() => setSelectedId(candidate.id)}
                >
                  {candidate.title}
                </button>
              ))}
            </nav>
          )}

          <div className="shell__sidebar-body">{Sidebar && <Sidebar />}</div>

          <div className="shell__footer">
            <Menu
              label="Aparência"
              icon={THEMES.find((option) => option.id === theme)?.icon}
              align="start"
              items={THEMES.map((option): MenuItem => ({
                id: option.id,
                label: option.label,
                icon: option.icon,
                checked: option.id === theme,
                onSelect: () => setTheme(option.id),
              }))}
            />
          </div>
        </aside>

        <div className="shell__page">
          <header className="shell__topbar">
            {collapsed && <SidebarToggleButton />}
            <div className="shell__topbar-content">{Topbar && <Topbar />}</div>
          </header>
          <main className="shell__main">
            {Main ? <Main /> : <p className="shell__empty">Nenhum módulo carregado.</p>}
          </main>
        </div>
      </div>
    </ShellProvider>
  );
}
