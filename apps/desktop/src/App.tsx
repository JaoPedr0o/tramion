import type { ViewRegistry } from "@tramion/contracts";
import {
  Menu,
  MonitorIcon,
  MoonIcon,
  ShellProvider,
  SidebarToggleButton,
  SunIcon,
  type MenuItem,
  Logo,
} from "@tramion/ui";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { isNarrowScreen, useDrawerGestures, useNarrowScreen } from "./drawer";
import { ViewSwitcher } from "./ViewSwitcher";
import { installSafeArea, setSystemBarsLight } from "./safe-area";
import { applyTheme, isLightTheme, readTheme, saveTheme, type ThemePreference } from "./theme";

const STORAGE_KEY = "tramion.sidebarCollapsed";
/** Chaves dos nomes antigos do app: a preferência de quem já usava continua valendo. */
const LEGACY_STORAGE_KEYS = ["aesthetic.sidebarCollapsed", "aun.sidebarCollapsed"];

// O armazenamento do navegador pode faltar (janela privada, dados bloqueados): nesse caso o app só
// deixa de lembrar o estado da barra lateral, sem quebrar.
function readCollapsed(): boolean {
  try {
    const stored =
      [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]
        .map((key) => localStorage.getItem(key))
        .find((value) => value !== null) ?? undefined;
    // Em tela de celular a gaveta sempre começa fechada (a preferência guardada é a do computador).
    return isNarrowScreen() || stored === "1";
  } catch {
    return isNarrowScreen();
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
export default function App({ views, workspaceName = "Tramion" }: Props) {
  const available = views.list();
  const [selectedId, setSelectedId] = useState(available[0]?.id);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [theme, setTheme] = useState(readTheme);

  const narrow = useNarrowScreen();
  const toggleSidebar = useCallback(() => setCollapsed((previous) => !previous), []);
  const openSidebar = useCallback(() => setCollapsed(false), []);
  const closeSidebar = useCallback(() => setCollapsed(true), []);
  // Na gaveta do celular, abrir e fechar é passageiro: só o estado do computador é lembrado.
  useEffect(() => {
    if (!narrow) saveCollapsed(collapsed);
  }, [collapsed, narrow]);
  useDrawerGestures(narrow, !collapsed, openSidebar, closeSidebar);
  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
    // Os ícones das barras do sistema (celular) acompanham o tema do app, e não o do sistema.
    setSystemBarsLight(isLightTheme(theme));
    if (theme !== "system" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemBarsLight(isLightTheme("system"));
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, [theme]);

  // Celular: margens seguras (barras do sistema e teclado) informadas pelo Android.
  useEffect(() => installSafeArea(), []);

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
  // Trocar de tela; no celular a gaveta fecha, para mostrá-la.
  const selectView = (id: string) => {
    setSelectedId(id);
    if (narrow) closeSidebar();
  };
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
            <ViewSwitcher views={available} selectedId={view?.id} onSelect={selectView} />
          )}

          <div
            className="shell__sidebar-body"
            onClick={(event) => {
              // No celular, escolher uma página ou uma ação fecha a gaveta. Botões que abrem um menu ou janelinha
              // ancorada nela (aria-haspopup) a mantêm aberta, senão a janelinha perderia o lugar onde se apoia.
              if (!narrow) return;
              const target = event.target as HTMLElement;
              if (target.closest("[aria-haspopup]")) return;
              if (target.closest(".page-tree__item, .sidebar-row")) closeSidebar();
            }}
          >
            {Sidebar && <Sidebar />}
          </div>

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

        {/* Atrás da gaveta (celular): tocar fora dela a fecha. */}
        {narrow && !collapsed && (
          <div className="shell__backdrop" aria-hidden="true" onClick={closeSidebar} />
        )}

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
